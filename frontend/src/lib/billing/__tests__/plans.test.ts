import { describe, it, expect, afterEach } from "vitest";
import {
  PERIODS,
  TIERS,
  TIER_ORDER,
  BUNDLES,
  CREDIT_COSTS,
  WELCOME_CREDITS,
  priceFor,
  costOf,
  pricePer100,
  matchesTestCode,
  testUnlockConfigured,
} from "../plans";

const ORIGINAL_CODE = process.env.NEXT_PUBLIC_TEST_UNLOCK_CODE;

afterEach(() => {
  if (ORIGINAL_CODE === undefined) delete process.env.NEXT_PUBLIC_TEST_UNLOCK_CODE;
  else process.env.NEXT_PUBLIC_TEST_UNLOCK_CODE = ORIGINAL_CODE;
});

describe("tier catalogue", () => {
  it("orders tiers by ascending level and price", () => {
    const levels = TIER_ORDER.map((t) => TIERS[t].level);
    const prices = TIER_ORDER.map((t) => TIERS[t].priceMonthlyInr);
    expect(levels).toEqual([...levels].sort((a, b) => a - b));
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
  });

  it("grants more credits at every step up", () => {
    const credits = TIER_ORDER.map((t) => TIERS[t].monthlyCredits);
    for (let i = 1; i < credits.length; i++) expect(credits[i]).toBeGreaterThan(credits[i - 1]);
  });

  it("keeps basic free and every paid tier priced", () => {
    expect(TIERS.basic.priceMonthlyInr).toBe(0);
    for (const t of TIER_ORDER.filter((x) => x !== "basic")) {
      expect(TIERS[t].priceMonthlyInr).toBeGreaterThan(0);
    }
  });

  it("unlocks personas only on paid tiers", () => {
    expect(TIERS.basic.personas).toBe(false);
    expect(TIERS.plus.personas).toBe(true);
    expect(TIERS.pro.personas).toBe(true);
    expect(TIERS.max.personas).toBe(true);
  });
});

describe("priceFor", () => {
  it("is always free for basic, whatever the period", () => {
    for (const p of PERIODS) expect(priceFor("basic", p.id)).toBe(0);
  });

  it("charges more for a longer period on a paid tier", () => {
    const daily = priceFor("pro", "daily");
    const monthly = priceFor("pro", "monthly");
    const annual = priceFor("pro", "annual");
    expect(daily).toBeLessThan(monthly);
    expect(monthly).toBeLessThan(annual);
  });

  it("discounts annual against paying monthly twelve times", () => {
    for (const tier of ["plus", "pro", "max"] as const) {
      expect(priceFor(tier, "annual")).toBeLessThan(priceFor(tier, "monthly") * 12);
    }
  });

  it("applies charm pricing — never a round multiple of five", () => {
    for (const tier of ["plus", "pro", "max"] as const) {
      for (const p of PERIODS) {
        expect(priceFor(tier, p.id) % 5).not.toBe(0);
      }
    }
  });

  it("never returns a negative price", () => {
    for (const tier of TIER_ORDER) {
      for (const p of PERIODS) expect(priceFor(tier, p.id)).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("credit costs", () => {
  it("falls back to 1 credit for an unknown action", () => {
    expect(costOf("totally.unknown.action")).toBe(1);
  });

  it("returns the configured cost for a known action", () => {
    expect(costOf("music.generate")).toBe(CREDIT_COSTS["music.generate"]);
    expect(costOf("chat.message")).toBe(1);
  });

  it("keeps in-browser video rendering free", () => {
    expect(costOf("video.render")).toBe(0);
  });

  it("never prices an action negatively", () => {
    for (const action of Object.keys(CREDIT_COSTS)) expect(costOf(action)).toBeGreaterThanOrEqual(0);
  });
});

describe("bundles", () => {
  it("gets cheaper per credit as the pack grows — the loyalty curve", () => {
    const rates = BUNDLES.map(pricePer100);
    for (let i = 1; i < rates.length; i++) expect(rates[i]).toBeLessThan(rates[i - 1]);
  });

  it("increases credits and price monotonically", () => {
    for (let i = 1; i < BUNDLES.length; i++) {
      expect(BUNDLES[i].credits).toBeGreaterThan(BUNDLES[i - 1].credits);
      expect(BUNDLES[i].priceInr).toBeGreaterThan(BUNDLES[i - 1].priceInr);
    }
  });

  it("uses unique ids", () => {
    const ids = BUNDLES.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("marks exactly one pack as best value", () => {
    expect(BUNDLES.filter((b) => b.best).length).toBe(1);
  });

  it("never awards a negative bonus", () => {
    for (const b of BUNDLES) expect(b.bonus).toBeGreaterThanOrEqual(0);
  });
});

describe("test unlock code", () => {
  it("is disabled when no code is configured", () => {
    delete process.env.NEXT_PUBLIC_TEST_UNLOCK_CODE;
    expect(testUnlockConfigured()).toBe(false);
    expect(matchesTestCode("")).toBe(false);
    expect(matchesTestCode("anything")).toBe(false);
  });

  it("rejects an empty entry even when a code is configured", () => {
    process.env.NEXT_PUBLIC_TEST_UNLOCK_CODE = "s3cret";
    expect(matchesTestCode("")).toBe(false);
    expect(matchesTestCode("   ")).toBe(false);
  });

  it("matches the configured code, ignoring surrounding whitespace", () => {
    process.env.NEXT_PUBLIC_TEST_UNLOCK_CODE = "s3cret";
    expect(matchesTestCode("s3cret")).toBe(true);
    expect(matchesTestCode("  s3cret  ")).toBe(true);
  });

  it("rejects a wrong code", () => {
    process.env.NEXT_PUBLIC_TEST_UNLOCK_CODE = "s3cret";
    expect(matchesTestCode("wrong")).toBe(false);
  });

  it("does not treat a blank configured code as an unlock", () => {
    process.env.NEXT_PUBLIC_TEST_UNLOCK_CODE = "   ";
    expect(testUnlockConfigured()).toBe(false);
    expect(matchesTestCode("   ")).toBe(false);
  });
});

describe("welcome grant", () => {
  it("is a positive one-time grant", () => {
    expect(WELCOME_CREDITS).toBeGreaterThan(0);
  });
});
