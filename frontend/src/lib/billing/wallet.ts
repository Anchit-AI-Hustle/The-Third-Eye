"use client";

import { vaultGet, vaultSet } from "@/lib/deviceVault";
import type { BillingPeriod, Tier } from "./plans";

// Device-side billing state: the test unlock and the plan shown on this device.
// Credits are server-side (lib/credits.ts); no money moves here.

const APP = "billing";

export interface Subscription { tier: Tier; period: BillingPeriod; status: "active" | "unsubscribed"; since: string; }

export function isTestUnlocked(): boolean { return vaultGet<boolean>(APP, "testUnlock", false); }
/** Checks the code on the server (/api/billing/unlock) and unlocks this device if it matches. */
export async function unlockTest(code: string): Promise<boolean> {
  const r = await fetch("/api/billing/unlock", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }),
  }).catch(() => null);
  const ok = Boolean(r?.ok && (await r.json().catch(() => ({})))?.ok);
  if (ok) vaultSet(APP, "testUnlock", true);
  return ok;
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
export function cancelSubscription() {
  const s = getSubscription();
  if (s) vaultSet(APP, "subscription", { ...s, status: "unsubscribed" });
}

// ── Usage level (drives avatars), from the number of creations on the account ──
export const LEVELS = [
  { min: 0, name: "Newcomer", avatar: "🌱" },
  { min: 15, name: "Explorer", avatar: "🧭" },
  { min: 50, name: "Operator", avatar: "⚙️" },
  { min: 150, name: "Power User", avatar: "⚡" },
  { min: 400, name: "Architect", avatar: "🛰️" },
  { min: 1000, name: "Legend", avatar: "👑" },
];
export function userLevel(n: number): { name: string; avatar: string; index: number; next?: number } {
  let idx = 0;
  for (let i = 0; i < LEVELS.length; i++) if (n >= LEVELS[i].min) idx = i;
  return { name: LEVELS[idx].name, avatar: LEVELS[idx].avatar, index: idx, next: LEVELS[idx + 1]?.min };
}
