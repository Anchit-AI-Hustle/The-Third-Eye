import { scryptSync, randomBytes, timingSafeEqual } from "node:crypto";

import { PIN_LEN } from "@/lib/phone";

// The secret-handling half of phone sign-in, ported from parwah-hq
// (api/_auth.mjs). It uses node:crypto, so nothing here may be imported by a
// client component — the rules the sign-in form needs are in lib/phone.ts.

// scrypt, not a bare hash: a 4-digit PIN is ten thousand possibilities, so the
// only thing between a stolen table and every PIN in it is how long one guess
// takes.
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 32 };

export function hashPin(pin: string, salt?: string): { salt: string; hash: string } {
  const s = salt || randomBytes(16).toString("hex");
  const key = scryptSync(String(pin), s, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return { salt: s, hash: key.toString("hex") };
}

export function verifyPin(pin: string, salt?: string | null, hash?: string | null): boolean {
  if (!salt || !hash) return false;
  const a = Buffer.from(hashPin(pin, salt).hash, "hex");
  const b = Buffer.from(String(hash), "hex");
  // Constant time, so the answer cannot be found a digit at a time by watching
  // how long the reply takes.
  return a.length === b.length && timingSafeEqual(a, b);
}

// ---- lockout ------------------------------------------------------------
// Five tries, then fifteen minutes. A PIN_LEN-digit PIN is weak on its own; this
// is what makes it safe to type on a phone, by putting a sweep of all ten
// thousand out of reach by years rather than minutes.
export const MAX_TRIES = 5;
export const LOCK_MINUTES = 15;

export function lockMessage(until: string | Date): string {
  const mins = Math.max(1, Math.ceil((new Date(until).getTime() - Date.now()) / 60000));
  return `Too many wrong ${PIN_LEN}-digit PINs. Try again in ${mins} ${mins === 1 ? "minute" : "minutes"}.`;
}
