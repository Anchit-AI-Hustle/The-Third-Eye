// Kolab — the brand marketing AI. A universal, brand-ADAPTABLE lifecycle engine:
// give it any brand's profile and it produces a complete customer-lifecycle
// program, creator/influencer campaigns, and a marketing plan. Brand-agnostic by
// design (defaults to whatever brand you enter — Vahdam or anyone else).

export interface BrandProfile {
  name: string;
  industry?: string;
  product?: string; // what they sell
  audience?: string; // target customer
  positioning?: string; // how they want to be seen
  usp?: string; // key differentiators
  pricePoint?: "value" | "mid" | "premium" | "luxury";
  region?: string;
  channels?: string[]; // active channels
  competitors?: string;
  toneOfVoice?: string;
  stage?: "pre-launch" | "early" | "growth" | "scale" | "mature";
  goals?: string; // primary objective + KPI
  metricsNote?: string; // current numbers if known
  constraints?: string; // budget, compliance, do-nots
}

export type KolabMode = "lifecycle" | "creator" | "brandplan" | "retention";

export interface KolabModeMeta {
  id: KolabMode;
  label: string;
  icon: string;
  blurb: string;
}

export const KOLAB_MODES: KolabModeMeta[] = [
  { id: "lifecycle", label: "Lifecycle OS", icon: "Workflow", blurb: "A full customer-lifecycle program: acquisition → activation → onboarding → retention → win-back → loyalty, with segments, triggers, channels, cadence, offers & KPIs." },
  { id: "creator", label: "Creator Campaigns", icon: "Megaphone", blurb: "Influencer / creator collaboration plans: brief, ideal creator profile, deliverables, commission structure, and tracking — the Kolab marketplace play." },
  { id: "brandplan", label: "Brand Plan", icon: "Target", blurb: "A 90-day go-to-market + marketing plan: positioning, channel mix, budget split, calendar, and success metrics." },
  { id: "retention", label: "Retention & CRM", icon: "HeartPulse", blurb: "RFM segmentation, lifecycle emails/WhatsApp flows, win-back, and loyalty/referral program design." },
];
