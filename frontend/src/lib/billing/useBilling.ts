"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ensureWelcome, getBalance, getSubscription, isSubscribed, currentTier,
  subscribe as subscribeWallet, cancelSubscription as cancelWallet,
  purchaseBundle as purchaseWallet, canAfford, charge as chargeWallet,
  isTestUnlocked, unlockTest, clearTestUnlock, getLedger, usageTotal,
  userLevel, checkMilestones, recordUsage,
  type Subscription, type LedgerEntry,
} from "./wallet";
import { costOf, type BillingPeriod, type Tier } from "./plans";

// React binding for the device-vault wallet. Everything is client-side and
// synchronous; this hook just keeps a snapshot in state and re-reads after any
// mutation so the UI reflects balance / tier / level changes immediately.

export interface BillingSnapshot {
  ready: boolean;
  balance: number;
  tier: Tier;
  subscribed: boolean;
  subscription: Subscription | null;
  testUnlocked: boolean;
  usage: number;
  level: { name: string; avatar: string; index: number; next?: number };
  ledger: LedgerEntry[];
}

function snapshot(): Omit<BillingSnapshot, "ready"> {
  return {
    balance: getBalance(),
    tier: currentTier(),
    subscribed: isSubscribed(),
    subscription: getSubscription(),
    testUnlocked: isTestUnlocked(),
    usage: usageTotal(),
    level: userLevel(),
    ledger: getLedger(),
  };
}

export function useBilling() {
  const [snap, setSnap] = useState<BillingSnapshot>({
    ready: false, balance: 0, tier: "basic", subscribed: false, subscription: null,
    testUnlocked: false, usage: 0, level: { name: "Newcomer", avatar: "🌱", index: 0, next: 15 }, ledger: [],
  });

  const refresh = useCallback(() => setSnap({ ready: true, ...snapshot() }), []);

  useEffect(() => {
    ensureWelcome();
    checkMilestones();
    refresh();
    // Reflect changes made in other tabs.
    const onStorage = () => refresh();
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [refresh]);

  const subscribe = useCallback((tier: Tier, period: BillingPeriod) => {
    subscribeWallet(tier, period); refresh();
  }, [refresh]);

  const cancelSubscription = useCallback(() => { cancelWallet(); refresh(); }, [refresh]);

  const purchaseBundle = useCallback((id: string) => {
    const r = purchaseWallet(id); refresh(); return r;
  }, [refresh]);

  const charge = useCallback((action: string) => {
    const r = chargeWallet(action);
    const milestones = checkMilestones();
    refresh();
    return { ...r, milestones };
  }, [refresh]);

  const tryUnlock = useCallback((code: string) => {
    const ok = unlockTest(code); if (ok) refresh(); return ok;
  }, [refresh]);

  const lock = useCallback(() => { clearTestUnlock(); refresh(); }, [refresh]);

  return {
    ...snap,
    refresh,
    subscribe,
    cancelSubscription,
    purchaseBundle,
    charge,
    canAfford,
    costOf,
    recordUsage,
    tryUnlock,
    lock,
  };
}
