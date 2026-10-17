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
// Five tries, then a lock that LENGTHENS with each consecutive lockout — 15
// minutes, 1 hour, 6 hours, then 24. The ladder lives in SQL
// (phone_pin_attempt, 20260929010000_phone_pin_escalating_lock.sql) because the
// same statement has to test it and spend the try.
//
// A CORRECTION. This comment used to say five tries per fifteen minutes put a
// sweep of all ten thousand PINs "out of reach by years". It does not:
//
//   96 fifteen-minute windows a day × 5 tries = 480 guesses/day
//   10,000 / 480 = ~21 days to exhaust, ~10 for an even chance
//
// Three weeks of an unattended script. A FIXED lock cannot defend a secret this
// small, because the attacker's budget grows with time and the space is small
// enough for time to cover it. Escalation is what changes the arithmetic: four
// lockouts in and it is 5 guesses a day, so the space takes thousands of days —
// and it resets the moment the real person signs in, so nobody who mistypes
// their own PIN ever meets the top of the ladder.
//
// Six digits would be a million values instead of ten thousand and would not
// need any of this. That is the owner's call, recorded on PR #315.
export const MAX_TRIES = 5;

export function lockMessage(until: string | Date): string {
  const mins = Math.max(1, Math.ceil((new Date(until).getTime() - Date.now()) / 60000));
  const when =
    mins < 90
      ? `${mins} ${mins === 1 ? "minute" : "minutes"}`
      : `${Math.round(mins / 60)} hours`;
  return `Too many wrong ${PIN_LEN}-digit PINs. Try again in ${when}.`;
}
