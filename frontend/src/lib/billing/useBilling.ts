"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getSubscription, isSubscribed, currentTier, cancelSubscription as cancelWallet, setSubscription,
  isTestUnlocked, unlockTest, clearTestUnlock, userLevel,
  type Subscription,
} from "./wallet";
import { costOf, type BillingPeriod, type Tier } from "./plans";

// Credits live on the server, one wallet per account (/api/billing/credits).
// The plan shown and the test unlock are kept on the device.

export interface LedgerEntry { at: string; delta: number; reason: string; balance: number }

export interface BillingSnapshot {
  ready: boolean;
  balance: number;
  unlimited: boolean;
  tier: Tier;
  subscribed: boolean;
  subscription: Subscription | null;
  testUnlocked: boolean;
  usage: number;
  level: { name: string; avatar: string; index: number; next?: number };
  ledger: LedgerEntry[];
}

type Server = { balance: number; unlimited: boolean; usage: number; ledger: LedgerEntry[] };

function snapshot(server: Server): Omit<BillingSnapshot, "ready"> {
  return {
    ...server,
    tier: currentTier(),
    subscribed: isSubscribed(),
    subscription: getSubscription(),
    testUnlocked: isTestUnlocked(),
    level: userLevel(server.usage),
  };
}

export function useBilling() {
  const [snap, setSnap] = useState<BillingSnapshot>({
    ready: false, balance: 0, unlimited: false, tier: "basic", subscribed: false, subscription: null,
    testUnlocked: false, usage: 0, level: { name: "Newcomer", avatar: "🌱", index: 0, next: 15 }, ledger: [],
  });

  const serverRef = useRef<Server>({ balance: 0, unlimited: false, usage: 0, ledger: [] });
  const refresh = useCallback(() => setSnap({ ready: true, ...snapshot(serverRef.current) }), []);

  const load = useCallback(async () => {
    const r = await fetch("/api/billing/credits").catch(() => null);
    const d = r?.ok ? await r.json() : null;
    if (d) {
      serverRef.current = {
        balance: d.balance ?? 0,
        unlimited: Boolean(d.unlimited),
        usage: Number(d.used ?? 0),
        ledger: (d.ledger ?? []).map((e: { delta: number; reason: string; balance_after: number; created_at: string }) => ({ at: e.created_at, delta: e.delta, reason: e.reason, balance: e.balance_after })),
      };
    }
    refresh();
  }, [refresh]);

  useEffect(() => {
    void load();
    window.addEventListener(CREDITS_EVENT, load);
    window.addEventListener("focus", load);
    return () => { window.removeEventListener(CREDITS_EVENT, load); window.removeEventListener("focus", load); };
  }, [load]);

  const cancelSubscription = useCallback(() => { cancelWallet(); refresh(); }, [refresh]);

  // Owner accounts only (the server refuses everyone else): buys a pack or plan with no payment.
  const testPurchase = useCallback(async (what: { bundle: string } | { tier: Tier; period: BillingPeriod }) => {
    const r = await fetch("/api/billing/test-purchase", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(what),
    }).catch(() => null);
    const d = r ? await r.json().catch(() => ({})) : {};
    if (r?.ok && "tier" in what) setSubscription(what.tier, what.period);
    await load();
    return r?.ok ? { ok: true as const, added: Number(d.added) } : { ok: false as const, error: String(d.error ?? "The purchase failed.") };
  }, [load]);

  const canAfford = useCallback((action: string) =>
    serverRef.current.unlimited || serverRef.current.balance >= costOf(action), []);

  const tryUnlock = useCallback(async (code: string) => {
    const ok = await unlockTest(code); if (ok) refresh(); return ok;
  }, [refresh]);

  const lock = useCallback(() => { clearTestUnlock(); refresh(); }, [refresh]);

  return {
    ...snap,
    refresh,
    reload: load,
    cancelSubscription,
    testPurchase,
    canAfford,
    costOf,
    tryUnlock,
    lock,
  };
}

export const CREDITS_EVENT = "jarvis:credits";

// Charges a creation that runs in the browser (see CLIENT_ACTIONS in the route).
export async function chargeCreation(action: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const r = await fetch("/api/billing/credits", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }),
  }).catch(() => null);
  const d = r ? await r.json().catch(() => ({})) : {};
  window.dispatchEvent(new Event(CREDITS_EVENT));
  return r?.ok ? { ok: true } : { ok: false, error: d.error || "Your credits could not be checked, so nothing was created." };
}
