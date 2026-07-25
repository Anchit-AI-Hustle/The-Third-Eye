"use client";

import { vaultGet, vaultSet } from "@/lib/deviceVault";
import { BUNDLES, TIERS, WELCOME_CREDITS, matchesTestCode, costOf, type BillingPeriod, type Tier } from "./plans";

// Test-mode wallet + subscription state, kept in the device vault. No real money
// moves here — purchases/recharges are simulated and PIN 2803 unlocks paid
// features for testing. A real deployment swaps purchaseBundle/subscribe for a
// payment-gateway (Razorpay/Stripe) callback + a server-verified ledger.

const APP = "billing";

export interface LedgerEntry { at: string; delta: number; reason: string; balance: number; }
export interface WalletState { balance: number; welcomed: boolean; ledger: LedgerEntry[]; }
export interface Subscription { tier: Tier; period: BillingPeriod; status: "active" | "unsubscribed"; since: string; }
export interface UsageState { total: number; byAction: Record<string, number>; }

function getWallet(): WalletState {
  return vaultGet<WalletState>(APP, "wallet", { balance: 0, welcomed: false, ledger: [] });
}
function setWallet(w: WalletState) { vaultSet(APP, "wallet", w); }

function push(w: WalletState, delta: number, reason: string): WalletState {
  w.balance = Math.max(0, w.balance + delta);
  w.ledger = [{ at: new Date().toISOString(), delta, reason, balance: w.balance }, ...w.ledger].slice(0, 200);
  return w;
}

/** Grant one-time welcome credits (CAC) on first use. */
export function ensureWelcome(): WalletState {
  const w = getWallet();
  if (!w.welcomed) { push(w, WELCOME_CREDITS, "Welcome credits"); w.welcomed = true; setWallet(w); }
  return w;
}

export function getBalance(): number { return getWallet().balance; }

export function isTestUnlocked(): boolean { return vaultGet<boolean>(APP, "testUnlock", false); }
export function unlockTest(code: string): boolean {
  if (matchesTestCode(code)) { vaultSet(APP, "testUnlock", true); return true; }
  return false;
}
export function clearTestUnlock() { vaultSet(APP, "testUnlock", false); }

export function getSubscription(): Subscription | null {
  return vaultGet<Subscription | null>(APP, "subscription", null);
}
export function isSubscribed(): boolean {
  if (isTestUnlocked()) return true;
  const s = getSubscription();
  return !!s && s.status === "active" && s.tier !== "basic";
}
/** Effective tier — Max under the test unlock, else the active subscription, else Basic. */
export function currentTier(): Tier {
  if (isTestUnlocked()) return "max";
  const s = getSubscription();
  return s && s.status === "active" ? s.tier : "basic";
}

/** Simulate subscribing (real build: after gateway confirmation). Grants the
 *  tier's monthly credit allowance. */
export function subscribe(tier: Tier, period: BillingPeriod): Subscription {
  const sub: Subscription = { tier, period, status: "active", since: new Date().toISOString() };
  vaultSet(APP, "subscription", sub);
  if (tier !== "basic") {
    const w = getWallet();
    push(w, TIERS[tier].monthlyCredits, `${TIERS[tier].label} plan credits`);
    setWallet(w);
  }
  return sub;
}
export function cancelSubscription() {
  const s = getSubscription();
  if (s) vaultSet(APP, "subscription", { ...s, status: "unsubscribed" });
}

/** One-time credit purchase — allowed for ANY user, no subscription required. */
export function purchaseBundle(bundleId: string): { ok: boolean; added?: number } {
  const b = BUNDLES.find((x) => x.id === bundleId);
  if (!b) return { ok: false };
  const w = getWallet();
  push(w, b.credits + b.bonus, `Bundle: ${b.label}`);
  setWallet(w);
  return { ok: true, added: b.credits + b.bonus };
}

/** Can the user afford an action? (Test unlock → always yes.) */
export function canAfford(action: string): boolean {
  if (isTestUnlocked()) return true;
  return getBalance() >= costOf(action);
}

/** Charge credits for an action. Returns false (without charging) if unaffordable
 *  so the caller can raise the paywall. Test unlock never charges. */
export function charge(action: string): { ok: boolean; cost: number; balance: number } {
  const cost = costOf(action);
  recordUsage(action);
  if (isTestUnlocked()) return { ok: true, cost: 0, balance: getBalance() };
  const w = getWallet();
  if (w.balance < cost) return { ok: false, cost, balance: w.balance };
  push(w, -cost, `Used: ${action}`);
  setWallet(w);
  return { ok: true, cost, balance: w.balance };
}

export function getLedger(): LedgerEntry[] { return getWallet().ledger; }

// ── Usage level (drives avatars / milestones / loyalty) ──
function getUsage(): UsageState { return vaultGet<UsageState>(APP, "usage", { total: 0, byAction: {} }); }
export function recordUsage(action: string) {
  const u = getUsage();
  u.total += 1;
  u.byAction[action] = (u.byAction[action] ?? 0) + 1;
  vaultSet(APP, "usage", u);
}
export function usageTotal(): number { return getUsage().total; }

export const LEVELS = [
  { min: 0, name: "Newcomer", avatar: "🌱" },
  { min: 15, name: "Explorer", avatar: "🧭" },
  { min: 50, name: "Operator", avatar: "⚙️" },
  { min: 150, name: "Power User", avatar: "⚡" },
  { min: 400, name: "Architect", avatar: "🛰️" },
  { min: 1000, name: "Legend", avatar: "👑" },
];
export function userLevel(): { name: string; avatar: string; index: number; next?: number } {
  const n = usageTotal();
  let idx = 0;
  for (let i = 0; i < LEVELS.length; i++) if (n >= LEVELS[i].min) idx = i;
  return { name: LEVELS[idx].name, avatar: LEVELS[idx].avatar, index: idx, next: LEVELS[idx + 1]?.min };
}

// ── Milestones (reward credits for progressing) ──
const MILESTONES = [
  { id: "first-use", label: "First action", at: 1, reward: 50 },
  { id: "explorer", label: "Reached Explorer", at: 15, reward: 100 },
  { id: "operator", label: "Reached Operator", at: 50, reward: 200 },
  { id: "power", label: "Reached Power User", at: 150, reward: 400 },
];
export function checkMilestones(): { label: string; reward: number }[] {
  const claimed = vaultGet<string[]>(APP, "milestones", []);
  const n = usageTotal();
  const newly: { label: string; reward: number }[] = [];
  for (const m of MILESTONES) {
    if (n >= m.at && !claimed.includes(m.id)) {
      const w = getWallet(); push(w, m.reward, `Milestone: ${m.label}`); setWallet(w);
      claimed.push(m.id); newly.push({ label: m.label, reward: m.reward });
    }
  }
  if (newly.length) vaultSet(APP, "milestones", claimed);
  return newly;
}
