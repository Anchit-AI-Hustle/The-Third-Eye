// web/lib/marketing/journeys.ts
// Lifecycle journey templates for Commerce (spec §5) and Local (spec §6), adapted from the
// vahdam-lifecycle-os retention-trigger set — generalised, brand-agnostic, and India-first.
// These are DEFAULT TEMPLATES a brand switches on and edits; the real journey engine (trigger →
// wait → branch → action) executes them in a later phase.
import type { RfmSegment, LifecycleStage } from "./rfm";

export type JourneyChannel = "email" | "whatsapp" | "sms" | "push";

export interface JourneyStep {
  step: number;
  message: string;
  offer?: string; // generic label; brands fill specifics — never fabricated
  waitDays?: number;
}

export interface JourneyTemplate {
  id: string;
  name: string;
  description: string;
  packs: ("commerce" | "local")[];
  /** Eligibility hints (documented; the engine enforces at runtime). */
  eligibleSegments?: RfmSegment[];
  eligibleStages?: LifecycleStage[];
  channel: JourneyChannel;
  /** Max one entry per profile per N days (from the retention-trigger throttles). */
  throttleDays: number;
  priority: number; // higher = more important when messages compete
  steps: JourneyStep[];
  starter?: boolean; // switched on (in draft) during onboarding
}

export const JOURNEY_TEMPLATES: JourneyTemplate[] = [
  {
    id: "welcome_series",
    name: "Welcome series",
    description: "Onboard a new customer/guest with brand story + first-order or first-visit nudge.",
    packs: ["commerce", "local"],
    eligibleStages: ["NEW"],
    channel: "whatsapp",
    throttleDays: 30,
    priority: 70,
    starter: true,
    steps: [
      { step: 1, message: "Welcome + what to expect" },
      { step: 2, message: "Bestsellers / signature picks", waitDays: 2 },
      { step: 3, message: "First-order incentive", offer: "first_purchase", waitDays: 3 },
    ],
  },
  {
    id: "abandoned_cart",
    name: "Abandoned cart",
    description: "Recover a started-but-unfinished checkout with a reminder and light incentive.",
    packs: ["commerce"],
    channel: "whatsapp",
    throttleDays: 7,
    priority: 90,
    starter: true,
    steps: [
      { step: 1, message: "You left something behind", waitDays: 0 },
      { step: 2, message: "Still thinking it over? Reviews + incentive", offer: "cart_recovery", waitDays: 1 },
    ],
  },
  {
    id: "second_order_nudge",
    name: "Second-order nudge",
    description: "Convert first-time buyers into repeat purchasers before the first-order churn cliff.",
    packs: ["commerce"],
    eligibleSegments: ["New", "Promising"],
    channel: "email",
    throttleDays: 45,
    priority: 75,
    steps: [
      { step: 1, message: "Social proof + how to get the most from your first order" },
      { step: 2, message: "Subscribe & save on your refill", offer: "subscribe_and_save", waitDays: 4 },
    ],
  },
  {
    id: "replenishment_reminder",
    name: "Replenishment reminder",
    description: "Predictive re-order nudge timed to expected consumption, before they run out.",
    packs: ["commerce"],
    eligibleStages: ["ACTIVE"],
    channel: "sms",
    throttleDays: 30,
    priority: 60,
    steps: [{ step: 1, message: "Time to restock — one-tap reorder or convert to subscription", offer: "reorder" }],
  },
  {
    id: "winback_sequence",
    name: "Win-back sequence",
    description: "Escalating reactivation for lapsed profiles with a decent reactivation likelihood.",
    packs: ["commerce", "local"],
    eligibleStages: ["LAPSED"],
    eligibleSegments: ["At Risk", "Hibernating", "About to Sleep"],
    channel: "email",
    throttleDays: 120,
    priority: 78,
    starter: true,
    steps: [
      { step: 1, message: "We miss you — what's new" },
      { step: 2, message: "A reason to come back", offer: "free_sample_or_addon", waitDays: 5 },
      { step: 3, message: "Final win-back", offer: "comeback_discount", waitDays: 5 },
    ],
  },
  {
    id: "vip_early_access",
    name: "VIP early access",
    description: "Status-driven early access to drops for your best customers — no discount (protects the halo).",
    packs: ["commerce", "local"],
    eligibleStages: ["VIP"],
    eligibleSegments: ["Champions", "Loyal"],
    channel: "email",
    throttleDays: 30,
    priority: 85,
    steps: [{ step: 1, message: "Early access — 48h before everyone else" }],
  },
  {
    id: "churn_intercept",
    name: "High-risk churn intercept",
    description: "Catch a high churn-risk, high-value profile before they leave; routes to a retention offer + review.",
    packs: ["commerce"],
    eligibleStages: ["RISK", "ACTIVE", "VIP"],
    eligibleSegments: ["At Risk", "Need Attention"],
    channel: "whatsapp",
    throttleDays: 14,
    priority: 95,
    steps: [{ step: 1, message: "We'd hate to lose you — tailored retention offer", offer: "retention" }],
  },
  // Local-pack guest lifecycle (spec §6)
  {
    id: "post_visit_review",
    name: "Post-visit thank-you + review request",
    description: "Thank a guest after a visit and ask for a review while the experience is fresh.",
    packs: ["local"],
    channel: "whatsapp",
    throttleDays: 7,
    priority: 80,
    starter: true,
    steps: [{ step: 1, message: "Thanks for visiting — leave a quick review", waitDays: 0 }],
  },
  {
    id: "birthday_offer",
    name: "Birthday / anniversary offer",
    description: "Occasion-based offer on a guest's birthday or anniversary.",
    packs: ["local"],
    channel: "whatsapp",
    throttleDays: 300,
    priority: 65,
    starter: true,
    steps: [{ step: 1, message: "Happy birthday — a treat on us", offer: "birthday" }],
  },
  {
    id: "lapsed_guest_winback",
    name: "Lapsed-guest win-back",
    description: "Re-invite a guest who hasn't visited in 30/60/90 days.",
    packs: ["local"],
    channel: "whatsapp",
    throttleDays: 45,
    priority: 72,
    steps: [
      { step: 1, message: "We miss you — here's what's new" },
      { step: 2, message: "A reason to come back this week", offer: "return_visit", waitDays: 30 },
    ],
  },
];

export function journeysForPack(pack: "commerce" | "local"): JourneyTemplate[] {
  return JOURNEY_TEMPLATES.filter((j) => j.packs.includes(pack));
}

export function starterJourneys(pack: "commerce" | "local"): JourneyTemplate[] {
  return journeysForPack(pack).filter((j) => j.starter);
}
