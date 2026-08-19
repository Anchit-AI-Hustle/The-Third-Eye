// web/lib/privileged.ts
// SERVER-ONLY resolution of the complimentary-access ("privileged") allow-list.
// CLAUDE.md guardrail #7 + SECURITY.md §12: the real phone numbers are personal data and
// must never appear in the client bundle. They are read from KOLAB_PRIVILEGED_NUMBERS (env)
// here, on the server, and in production should be backed by a DB table instead of env.
//
// The pure normalize/parse/isPrivileged functions are exported for unit testing without env.

/** Normalise any phone input to the last 10 digits (India mobile), matching the prototype. */
export function normalizePhone(input: string | null | undefined): string {
  return (input ?? "").replace(/\D/g, "").slice(-10);
}

/** Parse a comma/space/newline-separated allow-list into a Set of normalised numbers. */
export function parsePrivilegedList(raw: string | null | undefined): Set<string> {
  const set = new Set<string>();
  for (const part of (raw ?? "").split(/[\s,]+/)) {
    const n = normalizePhone(part);
    if (n.length === 10) set.add(n);
  }
  return set;
}

/** Is a given phone on the provided allow-list? Pure — caller supplies the set. */
export function isPrivileged(phone: string | null | undefined, list: Set<string>): boolean {
  const n = normalizePhone(phone);
  return n.length === 10 && list.has(n);
}

/** Server-side convenience: read the env-backed list and test a phone against it. */
export function isPrivilegedFromEnv(phone: string | null | undefined): boolean {
  const list = parsePrivilegedList(process.env.KOLAB_PRIVILEGED_NUMBERS);
  return isPrivileged(phone, list);
}
