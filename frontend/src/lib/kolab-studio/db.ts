// web/lib/db.ts
// Server-side data access. All reads run through the request-scoped RLS client so a user
// can only ever see their own rows; the authoritative entitlement context is assembled here
// and is the ONLY source of truth for gating (never the client — CLAUDE.md guardrail #2, #4).
import "server-only";
import { supabaseServer } from "./supabaseServer";
import { toEntitlementContext } from "./entitlements";
import type { EntitlementContext, KycStatus, Plan, Profile, SubStatus } from "./types";

/** The currently authenticated user, or null. */
export async function getSessionUser() {
  const supabase = supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/** Load the signed-in user's profile (RLS-scoped). */
export async function getMyProfile(): Promise<Profile | null> {
  const supabase = supabaseServer();
  const { data } = await supabase.from("profiles").select("*").maybeSingle();
  return (data as Profile | null) ?? null;
}

/**
 * Authoritative, server-computed entitlement context for the signed-in user.
 * Reads profile.privileged, kyc_verifications.status, subscriptions.status/plan under RLS.
 */
export async function getEntitlementContext(): Promise<EntitlementContext> {
  const supabase = supabaseServer();
  const [{ data: profile }, { data: kyc }, { data: sub }] = await Promise.all([
    supabase.from("profiles").select("privileged").maybeSingle(),
    supabase.from("kyc_verifications").select("status").maybeSingle(),
    supabase.from("subscriptions").select("status, plan").maybeSingle(),
  ]);
  return toEntitlementContext({
    profile: (profile as { privileged: boolean } | null) ?? null,
    kyc: (kyc as { status: KycStatus } | null) ?? null,
    subscription: (sub as { status: SubStatus; plan: Plan | null } | null) ?? null,
  });
}
