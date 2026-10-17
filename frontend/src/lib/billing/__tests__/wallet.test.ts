import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  getSubscription,
  isSubscribed,
  currentTier,
  cancelSubscription,
  userLevel,
  isTestUnlocked,
  unlockTest,
  clearTestUnlock,
  LEVELS,
} from "../wallet";
import { vaultSet } from "@/lib/deviceVault";

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

  it("stops counting as subscribed after cancellation", () => {
    vaultSet("billing", "subscription", { tier: "max", period: "annual", status: "active", since: new Date().toISOString() });
    expect(isSubscribed()).toBe(true);
    cancelSubscription();
    expect(isSubscribed()).toBe(false);
    expect(currentTier()).toBe("basic");
  });
});

describe("usage levels", () => {
  it("starts at the first level", () => {
    expect(userLevel(0).name).toBe(LEVELS[0].name);
    expect(userLevel(0).index).toBe(0);
  });

  it("promotes once the threshold is crossed", () => {
    expect(userLevel(LEVELS[1].min).name).toBe(LEVELS[1].name);
  });

  it("reports the next threshold until the top level", () => {
    expect(userLevel(0).next).toBe(LEVELS[1].min);
  });

  it("has no next threshold at the top level", () => {
    const top = userLevel(LEVELS[LEVELS.length - 1].min);
    expect(top.index).toBe(LEVELS.length - 1);
    expect(top.next).toBeUndefined();
  });

  it("defines levels in ascending order", () => {
    const mins = LEVELS.map((l) => l.min);
    expect(mins).toEqual([...mins].sort((a, b) => a - b));
  });
});
