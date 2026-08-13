import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  ensureWelcome,
  getBalance,
  getLedger,
  getSubscription,
  isSubscribed,
  currentTier,
  subscribe,
  cancelSubscription,
  purchaseBundle,
  canAfford,
  charge,
  recordUsage,
  usageTotal,
  userLevel,
  checkMilestones,
  isTestUnlocked,
  unlockTest,
  clearTestUnlock,
  LEVELS,
} from "../wallet";
import { BUNDLES, TIERS, WELCOME_CREDITS, costOf } from "../plans";

const ORIGINAL_CODE = process.env.NEXT_PUBLIC_TEST_UNLOCK_CODE;

beforeEach(() => {
  localStorage.clear();
  process.env.NEXT_PUBLIC_TEST_UNLOCK_CODE = "unlock-me";
});

afterEach(() => {
  localStorage.clear();
  if (ORIGINAL_CODE === undefined) delete process.env.NEXT_PUBLIC_TEST_UNLOCK_CODE;
  else process.env.NEXT_PUBLIC_TEST_UNLOCK_CODE = ORIGINAL_CODE;
});

describe("welcome credits", () => {
  it("grants the welcome balance on first call", () => {
    expect(getBalance()).toBe(0);
    ensureWelcome();
    expect(getBalance()).toBe(WELCOME_CREDITS);
  });

  it("is idempotent — never grants twice", () => {
    ensureWelcome();
    ensureWelcome();
    ensureWelcome();
    expect(getBalance()).toBe(WELCOME_CREDITS);
  });

  it("records the grant in the ledger", () => {
    ensureWelcome();
    const ledger = getLedger();
    expect(ledger).toHaveLength(1);
    expect(ledger[0].delta).toBe(WELCOME_CREDITS);
    expect(ledger[0].balance).toBe(WELCOME_CREDITS);
  });
});

describe("charging", () => {
  it("deducts exactly the action cost", () => {
    ensureWelcome();
    const before = getBalance();
    const res = charge("chat.message");
    expect(res.ok).toBe(true);
    expect(res.cost).toBe(costOf("chat.message"));
    expect(getBalance()).toBe(before - costOf("chat.message"));
  });

  it("refuses and does not deduct when the balance is short", () => {
    // No welcome grant: balance is 0.
    const res = charge("music.generate");
    expect(res.ok).toBe(false);
    expect(getBalance()).toBe(0);
  });

  it("leaves the balance untouched on a refused charge even after many attempts", () => {
    for (let i = 0; i < 5; i++) charge("music.generate");
    expect(getBalance()).toBe(0);
  });

  it("never drives the balance negative", () => {
    ensureWelcome();
    for (let i = 0; i < 100; i++) charge("music.generate");
    expect(getBalance()).toBeGreaterThanOrEqual(0);
  });

  it("writes a negative ledger entry for a successful charge", () => {
    ensureWelcome();
    charge("studio.text");
    const [latest] = getLedger();
    expect(latest.delta).toBe(-costOf("studio.text"));
    expect(latest.reason).toContain("studio.text");
  });

  it("counts usage even when the charge is refused", () => {
    charge("music.generate");
    expect(usageTotal()).toBe(1);
  });

  it("allows a zero-cost action at a zero balance", () => {
    const res = charge("video.render");
    expect(res.ok).toBe(true);
    expect(getBalance()).toBe(0);
  });
});

describe("canAfford", () => {
  it("is false at a zero balance for a paid action", () => {
    expect(canAfford("music.generate")).toBe(false);
  });

  it("is true once the balance covers the cost", () => {
    ensureWelcome();
    expect(canAfford("chat.message")).toBe(true);
  });

  it("agrees with charge() at the exact boundary", () => {
    ensureWelcome();
    const cost = costOf("music.generate");
    // Drain to exactly one unit below the cost.
    while (getBalance() > cost - 1) charge("chat.message");
    expect(canAfford("music.generate")).toBe(false);
    expect(charge("music.generate").ok).toBe(false);
  });
});

describe("test unlock", () => {
  it("starts locked", () => {
    expect(isTestUnlocked()).toBe(false);
  });

  it("rejects a wrong code and stays locked", () => {
    expect(unlockTest("nope")).toBe(false);
    expect(isTestUnlocked()).toBe(false);
  });

  it("unlocks with the configured code", () => {
    expect(unlockTest("unlock-me")).toBe(true);
    expect(isTestUnlocked()).toBe(true);
  });

  it("reports max tier and subscribed while unlocked", () => {
    unlockTest("unlock-me");
    expect(currentTier()).toBe("max");
    expect(isSubscribed()).toBe(true);
  });

  it("never charges credits while unlocked", () => {
    ensureWelcome();
    unlockTest("unlock-me");
    const before = getBalance();
    const res = charge("music.generate");
    expect(res.ok).toBe(true);
    expect(res.cost).toBe(0);
    expect(getBalance()).toBe(before);
  });

  it("affords anything while unlocked, even at a zero balance", () => {
    unlockTest("unlock-me");
    expect(canAfford("music.generate")).toBe(true);
  });

  it("reverts to basic once cleared", () => {
    unlockTest("unlock-me");
    clearTestUnlock();
    expect(isTestUnlocked()).toBe(false);
    expect(currentTier()).toBe("basic");
    expect(isSubscribed()).toBe(false);
  });
});

describe("subscriptions", () => {
  it("starts with no subscription on the basic tier", () => {
    expect(getSubscription()).toBeNull();
    expect(currentTier()).toBe("basic");
    expect(isSubscribed()).toBe(false);
  });

  it("activates the chosen tier and grants its monthly credits", () => {
    subscribe("pro", "monthly");
    expect(currentTier()).toBe("pro");
    expect(isSubscribed()).toBe(true);
    expect(getBalance()).toBe(TIERS.pro.monthlyCredits);
  });

  it("does not grant credits for a basic subscription", () => {
    subscribe("basic", "monthly");
    expect(getBalance()).toBe(0);
    expect(isSubscribed()).toBe(false);
  });

  it("stops counting as subscribed after cancellation", () => {
    subscribe("max", "annual");
    expect(isSubscribed()).toBe(true);
    cancelSubscription();
    expect(isSubscribed()).toBe(false);
    expect(currentTier()).toBe("basic");
  });

  it("keeps credits already granted after cancellation", () => {
    subscribe("plus", "monthly");
    const granted = getBalance();
    cancelSubscription();
    expect(getBalance()).toBe(granted);
  });

  it("records the period it was bought on", () => {
    subscribe("plus", "annual");
    expect(getSubscription()?.period).toBe("annual");
  });
});

describe("bundle purchase", () => {
  it("adds credits plus bonus", () => {
    const b = BUNDLES.find((x) => x.id === "value")!;
    const res = purchaseBundle("value");
    expect(res.ok).toBe(true);
    expect(res.added).toBe(b.credits + b.bonus);
    expect(getBalance()).toBe(b.credits + b.bonus);
  });

  it("rejects an unknown bundle without touching the balance", () => {
    ensureWelcome();
    const before = getBalance();
    const res = purchaseBundle("does-not-exist");
    expect(res.ok).toBe(false);
    expect(getBalance()).toBe(before);
  });

  it("works without a subscription — anyone can top up", () => {
    expect(isSubscribed()).toBe(false);
    expect(purchaseBundle("spark").ok).toBe(true);
    expect(getBalance()).toBeGreaterThan(0);
  });

  it("accumulates across repeated purchases", () => {
    purchaseBundle("spark");
    const once = getBalance();
    purchaseBundle("spark");
    expect(getBalance()).toBe(once * 2);
  });
});

describe("usage levels", () => {
  it("starts at the first level", () => {
    expect(userLevel().name).toBe(LEVELS[0].name);
    expect(userLevel().index).toBe(0);
  });

  it("promotes once the threshold is crossed", () => {
    for (let i = 0; i < LEVELS[1].min; i++) recordUsage("chat.message");
    expect(userLevel().name).toBe(LEVELS[1].name);
  });

  it("reports the next threshold until the top level", () => {
    expect(userLevel().next).toBe(LEVELS[1].min);
  });

  it("has no next threshold at the top level", () => {
    for (let i = 0; i < LEVELS[LEVELS.length - 1].min; i++) recordUsage("chat.message");
    expect(userLevel().index).toBe(LEVELS.length - 1);
    expect(userLevel().next).toBeUndefined();
  });

  it("defines levels in ascending order", () => {
    const mins = LEVELS.map((l) => l.min);
    expect(mins).toEqual([...mins].sort((a, b) => a - b));
  });
});

describe("milestones", () => {
  it("awards nothing before any usage", () => {
    expect(checkMilestones()).toHaveLength(0);
  });

  it("awards the first-action milestone once used", () => {
    recordUsage("chat.message");
    const earned = checkMilestones();
    expect(earned.length).toBeGreaterThan(0);
    expect(getBalance()).toBeGreaterThan(0);
  });

  it("never awards the same milestone twice", () => {
    recordUsage("chat.message");
    checkMilestones();
    const balanceAfterFirst = getBalance();
    expect(checkMilestones()).toHaveLength(0);
    expect(getBalance()).toBe(balanceAfterFirst);
  });

  it("credits the reward into the ledger", () => {
    recordUsage("chat.message");
    checkMilestones();
    expect(getLedger().some((e) => e.reason.startsWith("Milestone:"))).toBe(true);
  });
});

describe("ledger", () => {
  it("is newest-first", () => {
    ensureWelcome();
    charge("chat.message");
    const [first, second] = getLedger();
    expect(new Date(first.at).getTime()).toBeGreaterThanOrEqual(new Date(second.at).getTime());
    expect(first.delta).toBeLessThan(0);
  });

  it("keeps the running balance consistent with the newest entry", () => {
    ensureWelcome();
    charge("chat.message");
    expect(getLedger()[0].balance).toBe(getBalance());
  });

  it("caps at 200 entries", () => {
    purchaseBundle("mega");
    for (let i = 0; i < 250; i++) charge("chat.message");
    expect(getLedger().length).toBeLessThanOrEqual(200);
  });
});
