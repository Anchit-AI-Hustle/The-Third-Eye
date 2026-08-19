// web/lib/marketing/policy.ts
// Sending governance ported from the vahdam-lifecycle-os Master Operating Contract:
// promotional frequency caps, quiet hours, dedupe window, and per-journey throttles.
// Pure + testable — the send pipeline calls canSend() before every message.

export interface SendingPolicy {
  /** Promotional messages allowed per rolling 7 days (absolute hard cap in parentheses). */
  promoCapPer7Days: number;
  promoAbsoluteCapPer7Days: number;
  /** Local quiet hours during which non-transactional sends are held. */
  quietHours: { start: string; end: string }; // "HH:MM" local
  /** Identical (channel,template) to the same profile suppressed within this window. */
  dedupeWindowHours: number;
}

export const DEFAULT_POLICY: SendingPolicy = {
  promoCapPer7Days: 2,
  promoAbsoluteCapPer7Days: 3,
  quietHours: { start: "21:00", end: "08:00" },
  dedupeWindowHours: 24,
};

export interface SendContext {
  now: Date;
  /** Local hour 0..23 at the recipient's timezone. */
  localHour: number;
  isTransactional: boolean;
  /** Timestamps (ms) of promotional sends to this profile in the last 7 days. */
  promoSendsLast7Days: number[];
  /** Timestamps (ms) of sends with the SAME (channel,template) to this profile. */
  sameTemplateSends: number[];
}

export type SendDecision = { allowed: true } | { allowed: false; reason: string };

/** In quiet hours if localHour ∈ [start, 24) ∪ [0, end) for a window that wraps midnight. */
export function inQuietHours(localHour: number, q: SendingPolicy["quietHours"]): boolean {
  const start = parseInt(q.start.slice(0, 2), 10);
  const end = parseInt(q.end.slice(0, 2), 10);
  if (start <= end) return localHour >= start && localHour < end;
  return localHour >= start || localHour < end; // wraps midnight
}

/** Decide whether a message may send now, per policy. Transactional bypasses promo caps/quiet hours. */
export function canSend(ctx: SendContext, policy: SendingPolicy = DEFAULT_POLICY): SendDecision {
  const weekAgo = ctx.now.getTime() - 7 * 24 * 60 * 60 * 1000;
  const dedupeCutoff = ctx.now.getTime() - policy.dedupeWindowHours * 60 * 60 * 1000;

  // Dedupe applies to everything (never send the identical message twice in the window).
  if (ctx.sameTemplateSends.some((t) => t >= dedupeCutoff)) {
    return { allowed: false, reason: "dedupe: same template sent within the dedupe window" };
  }

  if (ctx.isTransactional) return { allowed: true };

  if (inQuietHours(ctx.localHour, policy.quietHours)) {
    return { allowed: false, reason: "quiet hours: held until the window opens" };
  }

  const promoInWeek = ctx.promoSendsLast7Days.filter((t) => t >= weekAgo).length;
  if (promoInWeek >= policy.promoAbsoluteCapPer7Days) {
    return { allowed: false, reason: "frequency: absolute promo cap for the last 7 days reached" };
  }
  if (promoInWeek >= policy.promoCapPer7Days) {
    return { allowed: false, reason: "frequency: preferred promo cap reached (over-cap needs override)" };
  }

  return { allowed: true };
}
