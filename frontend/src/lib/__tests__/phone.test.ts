import { describe, expect, it } from "vitest";

import { PIN_LEN, normPhone, phoneError, pinError } from "@/lib/phone";
import { MAX_TRIES, hashPin, lockMessage, verifyPin } from "@/lib/phonePin";

// Sign-in is a mobile number and a 4-digit PIN. These pin the two halves that
// decide who gets in: what counts as a real number, and what counts as the
// right PIN.

describe("normPhone", () => {
  it("defaults a bare number to India and returns it in E.164", () => {
    expect(normPhone("9876543210")).toEqual({ e164: "+919876543210", cc: "+91", local: "9876543210" });
  });

  it("reads the country code out of a full international number", () => {
    expect(normPhone("+14155552671")?.cc).toBe("+1");
    expect(normPhone("+919876543210")?.local).toBe("9876543210");
  });

  it("ignores the spaces, dashes and brackets people actually type", () => {
    expect(normPhone("98765 43210")?.e164).toBe("+919876543210");
    expect(normPhone("+1 (415) 555-2671")?.e164).toBe("+14155552671");
  });

  it("refuses a number that breaks its own country's shape", () => {
    // Indian mobiles start 6-9, and are exactly ten digits.
    expect(normPhone("1234567890")).toBeNull();
    expect(normPhone("987654321")).toBeNull();
    expect(normPhone("98765432101")).toBeNull();
  });

  it("applies the country the caller chose, not always India", () => {
    // Nine digits is a valid UK number and never a valid Indian one.
    expect(normPhone("712345678", "+44")?.e164).toBe("+44712345678");
    expect(normPhone("712345678")).toBeNull();
    // A US area code cannot start with 1; an Indian mobile can't start with 4.
    expect(normPhone("1234567890", "+1")).toBeNull();
    expect(normPhone("4155552671", "+1")?.e164).toBe("+14155552671");
  });

  it("returns null rather than a half-parsed number for junk", () => {
    expect(normPhone("")).toBeNull();
    expect(normPhone("not a phone")).toBeNull();
    expect(normPhone(undefined)).toBeNull();
  });

  it("names the country in the error, so the message says what is wrong", () => {
    expect(phoneError("+91")).toContain("India");
    expect(phoneError("+1")).toContain("10 digits");
  });
});

describe("pinError", () => {
  it("accepts a PIN of the right length that is not an obvious one", () => {
    expect(pinError("8305")).toBeNull();
  });

  it("says the length rather than just refusing", () => {
    expect(pinError("830")).toContain(`${PIN_LEN} numbers, you typed 3`);
    expect(pinError("83051")).toContain("you typed 5");
  });

  it("refuses anything that is not digits, including an empty PIN", () => {
    expect(pinError("83o5")).toBeTruthy();
    expect(pinError("")).toBeTruthy();
    expect(pinError(undefined)).toBeTruthy();
  });

  it("refuses the ones a thief tries first", () => {
    expect(pinError("0000")).toBeTruthy();
    expect(pinError("1111")).toBeTruthy();
    expect(pinError("1212")).toBeTruthy();
  });

  it("refuses a run of digits either way round", () => {
    expect(pinError("1234")).toBeTruthy();
    expect(pinError("4321")).toBeTruthy();
    expect(pinError("6789")).toBeTruthy();
  });
});

describe("hashPin / verifyPin", () => {
  it("never stores the PIN itself", () => {
    const { hash, salt } = hashPin("8305");
    expect(hash).not.toContain("8305");
    expect(salt).not.toContain("8305");
  });

  it("gives two people with the same PIN different hashes", () => {
    expect(hashPin("8305").hash).not.toBe(hashPin("8305").hash);
  });

  it("accepts the right PIN and refuses every other one", () => {
    const { hash, salt } = hashPin("8305");
    expect(verifyPin("8305", salt, hash)).toBe(true);
    expect(verifyPin("8306", salt, hash)).toBe(false);
    expect(verifyPin("", salt, hash)).toBe(false);
  });

  it("refuses when there is no stored PIN, rather than letting anyone in", () => {
    // An account whose PIN was cleared must not accept an empty check.
    expect(verifyPin("8305", null, null)).toBe(false);
    expect(verifyPin("8305", "somesalt", null)).toBe(false);
  });
});

describe("isEmailIdentity", () => {
  // The identity key stopped being an email when sign-in became a number, and
  // two consumers were still writing to it: Stripe's customer_email (which
  // rejects a phone number, so nobody signing in by number could subscribe) and
  // the cron's Gmail `To:` (which produced mail addressed to "+919876543210").
  it("tells an address apart from a phone number", async () => {
    const { isEmailIdentity } = await import("@/lib/serverIdentity");
    expect(isEmailIdentity("anchit@example.com")).toBe(true);
    expect(isEmailIdentity("+919876543210")).toBe(false);
    expect(isEmailIdentity("919876543210")).toBe(false);
    expect(isEmailIdentity(undefined)).toBe(false);
    expect(isEmailIdentity("")).toBe(false);
    // Not an email validator — just not fooled by the near misses.
    expect(isEmailIdentity("no-at-sign.example.com")).toBe(false);
    expect(isEmailIdentity("two@@example.com")).toBe(false);
    expect(isEmailIdentity("nodot@example")).toBe(false);
  });
});

describe("lockMessage", () => {
  it("says how long is left, rounded up so it never reads as zero", () => {
    expect(lockMessage(new Date(Date.now() + 60_000))).toContain("1 minute");
    expect(lockMessage(new Date(Date.now() + 14 * 60_000 + 30_000))).toContain("15 minutes");
    expect(lockMessage(new Date(Date.now() - 60_000))).toContain("1 minute");
  });

  it("locks after fewer tries than the PIN has possibilities, by a wide margin", () => {
    expect(MAX_TRIES).toBeLessThan(10);
  });
});
