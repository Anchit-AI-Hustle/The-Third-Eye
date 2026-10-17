import { scryptSync, randomBytes, timingSafeEqual } from "node:crypto";

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
// Five wrong tries lock the number for fifteen minutes. The try is claimed in
// SQL under a row lock before the PIN is hashed (phone_pin_attempt,
// 20261017200000_phone_pin_lock_15_minutes.sql), so parallel guesses cannot get
// past five.
export const MAX_TRIES = 5;

export function lockMessage(until: string | Date): string {
  const mins = Math.max(1, Math.ceil((new Date(until).getTime() - Date.now()) / 60000));
  return `Too many wrong PINs. Try again in ${mins} ${mins === 1 ? "minute" : "minutes"}.`;
}
