// The rules for signing in with a mobile number and a PIN, ported from
// parwah-hq (api/_phone.mjs).
//
// Deliberately dependency-free, and kept APART from the hashing half in
// lib/phonePin.ts: the sign-in form imports this module, so pulling node:crypto
// in here would drag it into the client bundle. Nothing secret is decided here —
// what a valid number looks like and what a bad PIN looks like are the same
// answers on both sides of the wire, and the form gives them before a round trip.

export const PHONE_CC: Record<string, { min: number; max: number; re?: RegExp; name: string }> = {
  "+91": { min: 10, max: 10, re: /^[6-9]\d{9}$/, name: "India" },
  "+1": { min: 10, max: 10, re: /^[2-9]\d{9}$/, name: "USA / Canada" },
  "+44": { min: 9, max: 10, name: "UK" },
  "+971": { min: 8, max: 9, name: "UAE" },
  "+61": { min: 9, max: 9, name: "Australia" },
  "+65": { min: 8, max: 8, re: /^[3689]\d{7}$/, name: "Singapore" },
  "+49": { min: 7, max: 11, name: "Germany" },
  "+81": { min: 9, max: 10, name: "Japan" },
  "+86": { min: 11, max: 11, name: "China" },
  "+92": { min: 10, max: 10, name: "Pakistan" },
  "+880": { min: 10, max: 10, name: "Bangladesh" },
  "+977": { min: 10, max: 10, name: "Nepal" },
  "+94": { min: 9, max: 9, name: "Sri Lanka" },
};

export interface ParsedPhone {
  e164: string;
  cc: string;
  local: string;
}

/**
 * Parse and validate a phone number. `v` may be a bare local number (then `cc`
 * applies, default +91) or a full +international string (the code is read from
 * it). Returns null when the number fails its country's rules.
 */
export function normPhone(v: unknown, cc?: unknown): ParsedPhone | null {
  const raw = String(v ?? "").replace(/[()\-\s.]/g, "");
  let code: string | null = null;
  let local: string | null = null;

  if (raw.startsWith("+")) {
    const digits = raw.slice(1);
    if (!/^\d{6,15}$/.test(digits)) return null;
    for (const k of Object.keys(PHONE_CC).sort((a, b) => b.length - a.length)) {
      if (raw.startsWith(k)) {
        code = k;
        local = raw.slice(k.length);
        break;
      }
    }
    if (!code) {
      // A country we have no rules for: split greedily, keeping a sane local part.
      for (const n of [3, 2, 1]) {
        const l = digits.slice(n);
        if (l.length >= 6 && l.length <= 12) {
          code = "+" + digits.slice(0, n);
          local = l;
          break;
        }
      }
      if (!code || !local) return null;
      return { e164: code + local, cc: code, local };
    }
  } else {
    if (!/^\d{4,14}$/.test(raw)) return null;
    code = cc && /^\+\d{1,3}$/.test(String(cc)) ? String(cc) : "+91";
    local = raw;
  }

  const rule = PHONE_CC[code];
  if (rule) {
    if (local!.length < rule.min || local!.length > rule.max) return null;
    if (rule.re && !rule.re.test(local!)) return null;
  } else if (local!.length < 6 || local!.length > 12) return null;
  return { e164: code + local!, cc: code, local: local! };
}

/** Human message when a number fails: names the country and the shape expected. */
export function phoneError(cc?: unknown): string {
  const key = cc && /^\+\d{1,3}$/.test(String(cc)) ? String(cc) : "+91";
  const r = PHONE_CC[key];
  if (!r) return "That does not look like a valid number for that country code";
  const len = r.min === r.max ? `${r.min} digits` : `${r.min}-${r.max} digits`;
  return `A ${r.name} number has ${len} after the country code — please check it`;
}

// ---- the PIN ------------------------------------------------------------
// Four digits, as asked for. It is a small secret — ten thousand possibilities —
// so the lockout in lib/phonePin.ts is what actually makes it safe.
export const PIN_LEN = 4;

// The ones a thief tries first. Refusing them costs nobody anything and removes
// the handful that would otherwise be guessed on the first attempt.
const WEAK = new Set([
  "0000", "1111", "2222", "3333", "4444", "5555", "6666", "7777", "8888", "9999",
  "1212", "2121", "1122", "1313", "2020", "2580", "0852", "6969", "1004", "1379",
]);

export function pinError(pin: unknown): string | null {
  const p = String(pin ?? "");
  if (!/^[0-9]+$/.test(p)) return `Your PIN is ${PIN_LEN} numbers.`;
  if (p.length !== PIN_LEN) return `Your PIN is ${PIN_LEN} numbers, you typed ${p.length}.`;
  if (WEAK.has(p)) return "That PIN is one of the first anyone would try. Please pick another.";
  // A run like 3456, forwards or backwards, is the same problem.
  let up = true;
  let down = true;
  for (let i = 1; i < p.length; i++) {
    if (+p[i] !== +p[i - 1] + 1) up = false;
    if (+p[i] !== +p[i - 1] - 1) down = false;
  }
  if (up || down) return "That PIN is one of the first anyone would try. Please pick another.";
  return null;
}
