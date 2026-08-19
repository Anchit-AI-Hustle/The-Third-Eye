// web/lib/entitlements.ts
// The core gate (PRD §4, CLAUDE.md guardrail #4). Pure functions — no I/O — so they
// are trivially testable and safe to import anywhere. The AUTHORITATIVE evaluation always
// happens on the server against the database (see lib/db.ts getEntitlementContext); the
// client may mirror this for UX only and MUST NOT be trusted for authorization.

import type { EntitlementContext, KycVerification, Subscription, Profile } from "./types";

/**
 * canUseFeatures = kyc_verified === true AND (subscription.active === true OR privileged === true)
 * Guests / unverified / unsubscribed-and-not-privileged users may only browse offerings.
 */
export function canUseFeatures(ctx: EntitlementContext): boolean {
  return ctx.kycVerified === true && (ctx.subscriptionActive === true || ctx.privileged === true);
}

/** Pro-tier capabilities (website builder, ad connectors, marketplace). */
export function canUsePro(ctx: EntitlementContext): boolean {
  if (!canUseFeatures(ctx)) return false;
  return ctx.privileged === true || ctx.plan === "pro";
}

/** Human-readable reason the gate is closed, for UX banners. `null` when open. */
export function gateReason(ctx: EntitlementContext): string | null {
  if (canUseFeatures(ctx)) return null;
  const needKyc = !ctx.kycVerified;
  const needSub = !(ctx.subscriptionActive || ctx.privileged);
  if (needKyc && needSub) return "Verify Aadhaar & subscribe to unlock features";
  if (needKyc) return "Verify your Aadhaar to unlock features";
  return "Subscribe to unlock features";
}

/** Assemble the entitlement context from raw rows. Missing rows are treated as "not granted". */
export function toEntitlementContext(input: {
  profile: Pick<Profile, "privileged"> | null;
  kyc: Pick<KycVerification, "status"> | null;
  subscription: Pick<Subscription, "status" | "plan"> | null;
}): EntitlementContext {
  return {
    kycVerified: input.kyc?.status === "verified",
    subscriptionActive: input.subscription?.status === "active",
    privileged: input.profile?.privileged === true,
    plan: input.subscription?.plan ?? null,
  };
}

/** Profile "complete" = name + DOB + pincode present (PRD §6.3). */
export function isProfileComplete(p: Pick<Profile, "name" | "dob" | "pincode"> | null): boolean {
  if (!p) return false;
  return Boolean(p.name && p.dob && p.pincode);
}
