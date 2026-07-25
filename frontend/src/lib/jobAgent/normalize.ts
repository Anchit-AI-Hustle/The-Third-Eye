import type { NormalizedJob } from "./types";

// Normalization helpers shared by all source adapters: canonical URL/keys,
// salary parsing, content hashing, and safe filenames.

/** Strip tracking params + fragments to get a stable canonical URL. */
export function canonicalizeUrl(raw: string): string {
  try {
    const u = new URL(raw);
    u.hash = "";
    const drop = [/^utm_/i, /^gclid$/i, /^fbclid$/i, /^ref$/i, /^source$/i, /^src$/i];
    for (const key of Array.from(u.searchParams.keys())) {
      if (drop.some((re) => re.test(key))) u.searchParams.delete(key);
    }
    // Normalize trailing slash.
    let s = u.toString();
    s = s.replace(/\/$/, "");
    return s;
  } catch {
    return raw;
  }
}

/** Small, stable, dependency-free hash (FNV-1a) → hex string. */
export function stableHash(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export function normalizeCompany(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(inc|llc|ltd|limited|corp|corporation|gmbh|pvt|private|co)\.?\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/\(.*?\)/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(sr|senior|jr|junior|staff|lead|principal|i|ii|iii|iv)\b/g, "")
    .trim();
}

/** Derive a stable app-side job id from source + source id or canonical url. */
export function deriveJobId(source: string, sourceJobId: string | undefined, canonicalUrl: string): string {
  return `${source}:${stableHash(sourceJobId || canonicalUrl)}`;
}

export function contentHashFor(j: Pick<NormalizedJob, "title" | "company" | "descriptionText">): string {
  return stableHash(`${j.title}|${j.company}|${j.descriptionText.slice(0, 2000)}`);
}

const CURRENCY_SYMBOLS: Record<string, string> = { "$": "USD", "£": "GBP", "€": "EUR", "₹": "INR" };

/** Best-effort salary parse. Only used when a source gives a text field. */
export function parseSalaryText(text: string | undefined): {
  min?: number;
  max?: number;
  currency?: string;
  interval?: string;
  original?: string;
} {
  if (!text) return {};
  const original = text.trim();
  let currency: string | undefined;
  for (const [sym, code] of Object.entries(CURRENCY_SYMBOLS)) {
    if (original.includes(sym)) { currency = code; break; }
  }
  const codeMatch = /\b(USD|GBP|EUR|INR|CAD|AUD)\b/i.exec(original);
  if (codeMatch) currency = codeMatch[1].toUpperCase();
  let interval: string | undefined;
  if (/\b(per\s*hour|\/\s*hr|hourly|an hour)\b/i.test(original)) interval = "hour";
  else if (/\b(per\s*year|\/\s*yr|annually|a year|p\.?a\.?)\b/i.test(original)) interval = "year";
  else if (/\b(per\s*month|\/\s*mo|monthly|a month)\b/i.test(original)) interval = "month";
  const nums = (original.match(/\d[\d,]*(?:\.\d+)?\s*[kK]?/g) || [])
    .map((n) => {
      const k = /[kK]$/.test(n.trim());
      const v = parseFloat(n.replace(/[,\sk K]/g, ""));
      return k ? v * 1000 : v;
    })
    .filter((n) => !isNaN(n) && n > 0);
  const [min, max] = nums.length >= 2 ? [Math.min(...nums), Math.max(...nums)] : nums.length === 1 ? [nums[0], undefined] : [undefined, undefined];
  return { min, max, currency, interval, original };
}

/** Filesystem/attachment-safe filename part (no path traversal, no unsafe chars). */
export function safeFilenamePart(s: string, fallback = "file"): string {
  const cleaned = (s || "")
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 60);
  return cleaned || fallback;
}

export function documentFilename(fullName: string, company: string, role: string, kind: string, ext: string): string {
  const parts = [safeFilenamePart(fullName, "Candidate"), safeFilenamePart(company, "Company"), safeFilenamePart(role, "Role"), kind]
    .filter(Boolean)
    .join("_");
  return `${parts}.${ext}`;
}
