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
/** Records a plan bought on this device (a test purchase on an owner account). */
export function setSubscription(tier: Tier, period: BillingPeriod) {
  vaultSet(APP, "subscription", { tier, period, status: "active", since: new Date().toISOString() });
}
export function cancelSubscription() {
  const s = getSubscription();
  if (s) vaultSet(APP, "subscription", { ...s, status: "unsubscribed" });
}
