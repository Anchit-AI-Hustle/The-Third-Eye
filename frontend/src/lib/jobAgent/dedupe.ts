import type { NormalizedJob } from "./types";
import { canonicalizeUrl, normalizeCompany, normalizeTitle } from "./normalize";

// Deduplicate a merged list of jobs from multiple sources, preferring the
// freshest + most complete record while preserving all source references.
// Layers: (1) exact source id, (2) canonical apply URL, (3) company+title+loc.
// We never merge on title alone — location must also line up.

function completeness(j: NormalizedJob): number {
  let n = 0;
  if (j.descriptionText && j.descriptionText.length > 200) n += 2;
  if (j.salaryMin || j.salaryMax) n += 1;
  if (j.skills?.length) n += 1;
  if (j.requirements?.length) n += 1;
  if (j.companyLogoUrl) n += 1;
  if (j.publishedAt) n += 1;
  return n;
}

function freshness(j: NormalizedJob): number {
  const t = j.publishedAt ? Date.parse(j.publishedAt) : NaN;
  return isNaN(t) ? 0 : t;
}

/** Prefer the record with more content, breaking ties by freshness. */
function pickBetter(a: NormalizedJob, b: NormalizedJob): NormalizedJob {
  const ca = completeness(a), cb = completeness(b);
  if (ca !== cb) return ca > cb ? a : b;
  return freshness(a) >= freshness(b) ? a : b;
}

export function dedupeJobs(jobs: NormalizedJob[]): NormalizedJob[] {
  const byKey = new Map<string, NormalizedJob>();
  const keyRefs = new Map<string, Set<string>>(); // canonical key → set of source labels

  const keysFor = (j: NormalizedJob): string[] => {
    const keys: string[] = [];
    if (j.sourceJobId) keys.push(`sid:${j.source}:${j.sourceJobId}`);
    if (j.applyUrl) keys.push(`url:${canonicalizeUrl(j.applyUrl)}`);
    keys.push(`cmp:${normalizeCompany(j.company)}|${normalizeTitle(j.title)}|${(j.locationText || "").toLowerCase().trim()}`);
    return keys;
  };

  for (const job of jobs) {
    const keys = keysFor(job);
    // Find any existing record sharing a key.
    let existingKey: string | undefined;
    for (const k of keys) if (byKey.has(k)) { existingKey = k; break; }

    if (!existingKey) {
      const primary = keys[0];
      byKey.set(primary, job);
      keyRefs.set(primary, new Set([job.sourceAttribution]));
      // Index all keys → primary so later dupes on any key collapse in.
      for (const k of keys) if (!byKey.has(k)) byKey.set(k, job);
      continue;
    }
    const winner = pickBetter(byKey.get(existingKey)!, job);
    const refs = keyRefs.get(existingKey) ?? new Set<string>();
    refs.add(job.sourceAttribution);
    refs.add(byKey.get(existingKey)!.sourceAttribution);
    winner.rawMetadata = { ...(winner.rawMetadata ?? {}), mergedSources: Array.from(refs) };
    for (const k of keys) byKey.set(k, winner);
    keyRefs.set(existingKey, refs);
  }

  // Collapse to unique job identities.
  const seen = new Set<string>();
  const out: NormalizedJob[] = [];
  for (const job of byKey.values()) {
    if (seen.has(job.id)) continue;
    seen.add(job.id);
    out.push(job);
  }
  return out;
}
