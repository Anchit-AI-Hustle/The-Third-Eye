// Single source of truth for what each subscription tier can do.
// The paywall line: reading is free; acting for you and proactivity are premium.

export type Tier = "free" | "premium";

export interface TierLimits {
  chatPerDay: number;        // -1 = unlimited
  webSearchPerDay: number;
  activeReminders: number;
  knowledgeDocs: number;
  canSendEmail: boolean;     // draft-only when false
  canScheduleEvents: boolean;
  dailyBriefing: boolean;
  recurringReminders: boolean;
  multiAgent: boolean;
  chatModel: "gemini-2.5-flash" | "gemini-2.5-pro";
}

export const TIERS: Record<Tier, TierLimits> = {
  free: {
    chatPerDay: 20,
    webSearchPerDay: 10,
    activeReminders: 3,
    knowledgeDocs: 5,
    canSendEmail: false,
    canScheduleEvents: false,
    dailyBriefing: false,
    recurringReminders: false,
    multiAgent: false,
    chatModel: "gemini-2.5-flash",
  },
  premium: {
    chatPerDay: -1,
    webSearchPerDay: -1,
    activeReminders: -1,
    knowledgeDocs: -1,
    canSendEmail: true,
    canScheduleEvents: true,
    dailyBriefing: true,
    recurringReminders: true,
    multiAgent: true,
    chatModel: "gemini-2.5-pro",
  },
};

// Tools gated behind premium. When a free user's model tries to call one, the
// server returns a paywall notice as the tool result instead of executing it.
export const PREMIUM_TOOLS = new Set<string>([
  "send_email",
  "multi_agent_run",
]);

export const PRICING = {
  currency: "usd",
  monthly: { amount: 800, label: "$8/mo" },   // cents
  yearly: { amount: 6000, label: "$60/yr" },
} as const;

// Launch mode: everything is unlocked for everyone and premium features are only
// *badged*, not gated. Set ENFORCE_PREMIUM=1 to switch on real paywall behavior.
export function premiumEnforced(): boolean {
  return process.env.ENFORCE_PREMIUM === "1";
}

export function limitsFor(tier: Tier): TierLimits {
  return TIERS[tier] ?? TIERS.free;
}

export function isUnlimited(n: number): boolean {
  return n < 0;
}

export const PAYWALL_MESSAGE =
  "That's a JARVIS Premium capability. Sending email and deep multi-agent analysis need an upgrade — tell the user they can enable it from Settings → Upgrade, and offer to draft the email instead.";
