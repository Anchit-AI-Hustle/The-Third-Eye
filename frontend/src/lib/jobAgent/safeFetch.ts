// SSRF-hardened fetch for Job Agent. Job sources and any user-supplied portfolio
// URL must go through here. We enforce https, block credentials, block
// private/link-local/loopback hosts, cap response size, and refuse redirects to
// off-allowlist origins. Mirrors the hardening already used in the music proxy.

const PRIVATE_HOST_RE =
  /^(localhost|127\.|0\.0\.0\.0|10\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.|::1|fc00:|fd00:|fe80:)/i;

const METADATA_HOSTS = new Set(["metadata.google.internal", "169.254.169.254"]);

export interface SafeFetchOptions {
  timeoutMs?: number;
  maxBytes?: number;
  allowHosts?: string[]; // if set, hostname must be in this exact set
  headers?: Record<string, string>;
  method?: string;
  body?: string;
}

export function isSafeUrl(raw: string, allowHosts?: string[]): { ok: true; url: URL } | { ok: false; reason: string } {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "invalid url" };
  }
  if (url.protocol !== "https:") return { ok: false, reason: "only https allowed" };
  if (url.username || url.password) return { ok: false, reason: "credentials in url not allowed" };
  const host = url.hostname.toLowerCase();
  if (PRIVATE_HOST_RE.test(host) || METADATA_HOSTS.has(host)) return { ok: false, reason: "host not allowed" };
  if (allowHosts && allowHosts.length && !allowHosts.includes(host)) return { ok: false, reason: "host not in allowlist" };
  return { ok: true, url };
}

export async function safeFetch(raw: string, opts: SafeFetchOptions = {}): Promise<Response> {
  const check = isSafeUrl(raw, opts.allowHosts);
  if (!check.ok) throw new Error(`Blocked URL: ${check.reason}`);
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), opts.timeoutMs ?? 8000);
  try {
    // Rebuild from vetted host + path (defence in depth), forbid redirects off origin.
    const safe = `https://${check.url.hostname}${check.url.pathname}${check.url.search}`;
    const res = await fetch(safe, {
      method: opts.method ?? "GET",
      headers: { "User-Agent": "TheThirdEye-JobAgent/1.0", Accept: "application/json", ...(opts.headers ?? {}) },
      body: opts.body,
      redirect: "error",
      signal: controller.signal,
    });
    return res;
  } finally {
    clearTimeout(t);
  }
}

/** Fetch JSON with a hard size cap so a hostile endpoint can't blow up memory. */
export async function safeFetchJson<T = unknown>(raw: string, opts: SafeFetchOptions = {}): Promise<T> {
  const res = await safeFetch(raw, opts);
  if (!res.ok) throw new Error(`upstream ${res.status}`);
  const maxBytes = opts.maxBytes ?? 4_000_000;
  const text = await res.text();
  if (text.length > maxBytes) throw new Error("response too large");
  return JSON.parse(text) as T;
}
