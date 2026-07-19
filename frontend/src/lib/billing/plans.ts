// Monetization model — configurable so prices/gaps/durations are easy to tune.
// Test-mode only in this build: no real gateway is wired (see wallet.ts). Real
// charges + installment/dunning/auto-renew need a payment provider + backend.

export type Tier = "basic" | "plus" | "pro" | "max";
export type BillingPeriod = "daily" | "weekly" | "monthly" | "quarterly" | "annual";

export interface PlanTier {
  id: Tier;
  label: string;
  level: number; // 0..3
  badge: string; // short badge text
  color: string;
  monthlyCredits: number; // credits granted per month at this tier
  priceMonthlyInr: number; // reference monthly price (INR); 0 = free
  features: string[];
  personas: boolean; // multi-agent personas unlocked
}

// Period multipliers relative to the monthly reference price. Annual/quarterly
// carry a discount (locked-in rate); daily/weekly are convenience-priced.
export const PERIODS: { id: BillingPeriod; label: string; days: number; factorVsMonthly: number; note?: string }[] = [
  { id: "daily", label: "Daily", days: 1, factorVsMonthly: 1 / 22, note: "pay-as-you-go" },
  { id: "weekly", label: "Weekly", days: 7, factorVsMonthly: 1 / 3.6 },
  { id: "monthly", label: "Monthly", days: 30, factorVsMonthly: 1 },
  { id: "quarterly", label: "3-monthly", days: 90, factorVsMonthly: 2.7, note: "~10% off" },
  { id: "annual", label: "Annual", days: 365, factorVsMonthly: 9.6, note: "~20% off · installments allowed" },
];

export const TIERS: Record<Tier, PlanTier> = {
  basic: { id: "basic", label: "Basic", level: 0, badge: "FREE", color: "#7878A8", monthlyCredits: 200, priceMonthlyInr: 0,
    features: ["Core apps", "200 credits / month", "Standard AI"], personas: false },
  plus: { id: "plus", label: "Plus", level: 1, badge: "PLUS", color: "#34D399", monthlyCredits: 2500, priceMonthlyInr: 399,
    features: ["Everything in Basic", "2,500 credits / month", "All Studio tools", "1 AI persona"], personas: true },
  pro: { id: "pro", label: "Pro", level: 2, badge: "PRO", color: "#4FC3F7", monthlyCredits: 7000, priceMonthlyInr: 999,
    features: ["Everything in Plus", "7,000 credits / month", "Priority generation", "All AI personas", "Job Agent + Kolab"], personas: true },
  max: { id: "max", label: "Max", level: 3, badge: "MAX", color: "#A78BFA", monthlyCredits: 25000, priceMonthlyInr: 1999,
    features: ["Everything in Pro", "25,000 credits / month", "Highest limits", "Early features", "Priority support"], personas: true },
};

export const TIER_ORDER: Tier[] = ["basic", "plus", "pro", "max"];

/** Price for a tier at a given billing period (INR), rounded to a clean number. */
export function priceFor(tier: Tier, period: BillingPeriod): number {
  const base = TIERS[tier].priceMonthlyInr;
  if (base === 0) return 0;
  const f = PERIODS.find((p) => p.id === period)!.factorVsMonthly;
  const raw = base * f;
  return Math.max(1, Math.round(raw / 5) * 5) - 1; // charm pricing (…9/…4)
}

// Per-action credit costs. Indicative + configurable (not a promise of any
// external provider's live rate). Client-side, best-effort metering.
export const CREDIT_COSTS: Record<string, number> = {
  "chat.message": 1,
  "assistant.action": 2,
  "studio.text": 3,
  "studio.html": 6,
  "music.generate": 20,
  "video.render": 0, // rendered in-browser, free
  "vision.analyze": 5,
  "transcribe.minute": 2,
  "jobagent.kit": 8,
  "health.plan": 3,
  "kolab.generate": 6,
};

export function costOf(action: string): number {
  return CREDIT_COSTS[action] ?? 1;
}

// One-time credit bundles (anyone can buy — no subscription required). A
// "paired incremental" ladder: value jumps every other step so mid packs feel
// like the smart buy. Bonus credits scale with size (more usage → cheaper/credit).
export interface Bundle {
  id: string;
  label: string;
  credits: number;
  bonus: number; // extra credits
  priceInr: number;
  best?: boolean;
}

export const BUNDLES: Bundle[] = [
  { id: "spark", label: "Spark", credits: 500, bonus: 0, priceInr: 149 },
  { id: "boost", label: "Boost", credits: 1200, bonus: 100, priceInr: 299 },
  { id: "value", label: "Value", credits: 3000, bonus: 400, priceInr: 649, best: true },
  { id: "power", label: "Power", credits: 7000, bonus: 1200, priceInr: 1399 },
  { id: "mega", label: "Mega", credits: 20000, bonus: 5000, priceInr: 3499 },
];

/** Effective ₹ per 100 credits — lower on bigger packs (the loyalty curve). */
export function pricePer100(b: Bundle): number {
  return +((b.priceInr / (b.credits + b.bonus)) * 100).toFixed(2);
}

export const WELCOME_CREDITS = 300; // CAC grant for a new user
export const TEST_PIN = "2803"; // unlocks all paid features for testing (no charge)
