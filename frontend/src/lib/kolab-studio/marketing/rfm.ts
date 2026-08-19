// web/lib/marketing/rfm.ts
// RFM segmentation + lifecycle stages for the Commerce/Local packs (spec §5, §6).
// Logic adapted from the vahdam-lifecycle-os retention engine (segment taxonomy, lifecycle
// stages), generalised and brand-agnostic — no product/brand facts are copied (their own
// zero-fabrication rule). Pure functions; unit-tested.

export type RfmSegment =
  | "Champions"
  | "Loyal"
  | "Potential Loyalist"
  | "New"
  | "Promising"
  | "Need Attention"
  | "About to Sleep"
  | "At Risk"
  | "Hibernating"
  | "Lost";

export type LifecycleStage = "NEW" | "ACTIVE" | "VIP" | "RISK" | "LAPSED" | "LOST";

export interface RfmScores {
  recency: 1 | 2 | 3 | 4 | 5; // 5 = most recent
  frequency: 1 | 2 | 3 | 4 | 5; // 5 = most frequent
  monetary: 1 | 2 | 3 | 4 | 5; // 5 = highest spend
}

/** Standard RFM → segment mapping (recency-led, FM combined), matching the lifecycle engine. */
export function classifyRfm({ recency, frequency, monetary }: RfmScores): RfmSegment {
  const fm = (frequency + monetary) / 2;
  if (recency >= 4 && fm >= 4) return "Champions";
  if (recency >= 3 && fm >= 4) return "Loyal";
  if (recency >= 4 && fm >= 3) return "Potential Loyalist";
  if (recency === 5 && fm <= 2) return "New";
  if (recency >= 4 && fm <= 2) return "Promising";
  // "Need Attention" = average recency with average FM. Fading low-value customers (recency 3,
  // low FM) must fall through to "About to Sleep" — so gate Need Attention on mid/high FM.
  if (recency === 3 && fm >= 2.5) return "Need Attention";
  if (recency >= 2 && recency <= 3 && fm <= 2) return "About to Sleep";
  if (recency <= 2 && fm >= 3) return "At Risk";
  if (recency <= 2 && fm >= 2) return "Hibernating";
  return "Lost";
}

/** Coarse lifecycle stage from order history + churn risk (feeds journey eligibility). */
export function lifecycleStage(input: {
  orderCount: number;
  daysSinceLastOrder: number;
  churnRisk: number; // 0..1
  isVip?: boolean;
}): LifecycleStage {
  const { orderCount, daysSinceLastOrder, churnRisk, isVip } = input;
  if (orderCount === 0) return "NEW";
  if (daysSinceLastOrder >= 180) return "LOST";
  if (daysSinceLastOrder >= 90) return "LAPSED";
  if (isVip) return "VIP";
  if (churnRisk >= 0.6) return "RISK";
  return "ACTIVE";
}

/** All segments, ordered best → worst, for dashboards and pickers. */
export const RFM_SEGMENTS: RfmSegment[] = [
  "Champions",
  "Loyal",
  "Potential Loyalist",
  "Promising",
  "New",
  "Need Attention",
  "About to Sleep",
  "At Risk",
  "Hibernating",
  "Lost",
];

/** One-line meaning per segment for UI tooltips. */
export const SEGMENT_BLURB: Record<RfmSegment, string> = {
  Champions: "Recent, frequent, high spend — reward and give early access.",
  Loyal: "Consistent repeat buyers — upsell and refer.",
  "Potential Loyalist": "Recent with growing frequency — nurture into loyalty.",
  Promising: "Recent first buyers — convert the second order.",
  New: "Just bought once — welcome and onboard.",
  "Need Attention": "Slipping cadence — timely nudge before they lapse.",
  "About to Sleep": "Fading engagement — re-engage now.",
  "At Risk": "Were valuable, now quiet — win back before it's too late.",
  Hibernating: "Long inactive — low-cost reactivation.",
  Lost: "Effectively churned — suppress or a final win-back only.",
};
