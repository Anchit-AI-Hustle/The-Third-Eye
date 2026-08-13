import { describe, it, expect, afterEach } from "vitest";
import {
  TIERS,
  PREMIUM_TOOLS,
  PRICING,
  PAYWALL_MESSAGE,
  limitsFor,
  isUnlimited,
  premiumEnforced,
} from "../entitlements";

const ORIGINAL = process.env.ENFORCE_PREMIUM;

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.ENFORCE_PREMIUM;
  else process.env.ENFORCE_PREMIUM = ORIGINAL;
});

describe("tier limits", () => {
  it("gives premium at least as much as free on every numeric limit", () => {
    const numeric = ["chatPerDay", "webSearchPerDay", "activeReminders", "knowledgeDocs"] as const;
    for (const key of numeric) {
      const free = TIERS.free[key];
      const premium = TIERS.premium[key];
      // -1 means unlimited, which beats any finite free limit.
      if (isUnlimited(premium)) continue;
      expect(premium).toBeGreaterThanOrEqual(free);
    }
  });

  it("never leaves a free numeric limit unlimited", () => {
    const numeric = ["chatPerDay", "webSearchPerDay", "activeReminders", "knowledgeDocs"] as const;
    for (const key of numeric) expect(isUnlimited(TIERS.free[key])).toBe(false);
  });

  it("makes every premium numeric limit unlimited", () => {
    const numeric = ["chatPerDay", "webSearchPerDay", "activeReminders", "knowledgeDocs"] as const;
    for (const key of numeric) expect(isUnlimited(TIERS.premium[key])).toBe(true);
  });

  it("never revokes a boolean capability when upgrading", () => {
    const flags = [
      "canSendEmail",
      "canScheduleEvents",
      "dailyBriefing",
      "recurringReminders",
      "multiAgent",
    ] as const;
    for (const key of flags) {
      if (TIERS.free[key]) expect(TIERS.premium[key]).toBe(true);
    }
  });

  it("holds the paywall line: acting for the user is premium-only", () => {
    expect(TIERS.free.canSendEmail).toBe(false);
    expect(TIERS.free.canScheduleEvents).toBe(false);
    expect(TIERS.premium.canSendEmail).toBe(true);
    expect(TIERS.premium.canScheduleEvents).toBe(true);
  });

  it("gives premium the stronger chat model", () => {
    expect(TIERS.free.chatModel).toBe("gemini-2.5-flash");
    expect(TIERS.premium.chatModel).toBe("gemini-2.5-pro");
  });
});

describe("limitsFor", () => {
  it("resolves each known tier", () => {
    expect(limitsFor("free")).toBe(TIERS.free);
    expect(limitsFor("premium")).toBe(TIERS.premium);
  });

  it("falls back to free for an unknown tier", () => {
    expect(limitsFor("enterprise" as never)).toBe(TIERS.free);
  });

  it("fails closed — an unknown tier never gets a premium capability", () => {
    const limits = limitsFor(undefined as never);
    expect(limits.canSendEmail).toBe(false);
    expect(limits.multiAgent).toBe(false);
  });
});

describe("isUnlimited", () => {
  it("treats negatives as unlimited", () => {
    expect(isUnlimited(-1)).toBe(true);
    expect(isUnlimited(-99)).toBe(true);
  });

  it("treats zero and positives as bounded", () => {
    expect(isUnlimited(0)).toBe(false);
    expect(isUnlimited(20)).toBe(false);
  });
});

describe("premiumEnforced", () => {
  it("is off unless explicitly switched on", () => {
    delete process.env.ENFORCE_PREMIUM;
    expect(premiumEnforced()).toBe(false);
  });

  it("is on only for the exact opt-in value", () => {
    process.env.ENFORCE_PREMIUM = "1";
    expect(premiumEnforced()).toBe(true);
  });

  it("does not enable on truthy-looking values", () => {
    for (const v of ["0", "true", "yes", "", "on"]) {
      process.env.ENFORCE_PREMIUM = v;
      expect(premiumEnforced()).toBe(false);
    }
  });
});

describe("premium tools", () => {
  it("gates multi-agent runs", () => {
    expect(PREMIUM_TOOLS.has("multi_agent_run")).toBe(true);
  });

  it("leaves read-only tools ungated", () => {
    for (const t of ["manage_tasks", "web_search", "get_current_time", "search_knowledge"]) {
      expect(PREMIUM_TOOLS.has(t)).toBe(false);
    }
  });

  it("matches the multiAgent capability flag", () => {
    expect(TIERS.free.multiAgent).toBe(false);
    expect(TIERS.premium.multiAgent).toBe(true);
  });
});

describe("pricing", () => {
  it("quotes amounts in minor units", () => {
    expect(Number.isInteger(PRICING.monthly.amount)).toBe(true);
    expect(Number.isInteger(PRICING.yearly.amount)).toBe(true);
  });

  it("discounts yearly against twelve months", () => {
    expect(PRICING.yearly.amount).toBeLessThan(PRICING.monthly.amount * 12);
  });

  it("keeps labels consistent with the amounts", () => {
    expect(PRICING.monthly.label).toContain(String(PRICING.monthly.amount / 100));
    expect(PRICING.yearly.label).toContain(String(PRICING.yearly.amount / 100));
  });
});

describe("paywall message", () => {
  it("offers the free alternative instead of a flat refusal", () => {
    expect(PAYWALL_MESSAGE).toMatch(/draft/i);
    expect(PAYWALL_MESSAGE).toMatch(/upgrade/i);
  });
});
