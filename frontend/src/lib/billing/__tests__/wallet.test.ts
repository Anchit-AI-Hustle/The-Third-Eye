import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
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

beforeEach(() => localStorage.clear());
afterEach(() => { localStorage.clear(); vi.unstubAllGlobals(); });

describe("test unlock", () => {
  const server = (ok: boolean) => vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok }), { status: 200 })));

  it("starts locked", () => {
    expect(isTestUnlocked()).toBe(false);
  });

  it("stays locked when the server rejects the code", async () => {
    server(false);
    expect(await unlockTest("nope")).toBe(false);
    expect(isTestUnlocked()).toBe(false);
  });

  it("unlocks when the server accepts the code, and checks it there", async () => {
    server(true);
    expect(await unlockTest("unlock-me")).toBe(true);
    expect(isTestUnlocked()).toBe(true);
    expect(fetch).toHaveBeenCalledWith("/api/billing/unlock", expect.objectContaining({ method: "POST", body: JSON.stringify({ code: "unlock-me" }) }));
  });

  it("reports max tier and subscribed while unlocked", async () => {
    server(true);
    await unlockTest("unlock-me");
    expect(currentTier()).toBe("max");
    expect(isSubscribed()).toBe(true);
  });

  it("reverts to basic once cleared", async () => {
    server(true);
    await unlockTest("unlock-me");
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
