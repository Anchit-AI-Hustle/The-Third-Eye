// Server-side data access for Kolab Studio. Kolab runs on the app's own sign-in and database:
// the user is the NextAuth session (id = session.user.email, the E.164 number under phone
// sign-in) and its tables live in the `kolab` schema. The connection is the table owner, so
// nothing here is protected by RLS — every read and write must scope by user_id (or, for orgs,
// by membership) itself. The entitlement context assembled here is the ONLY source of truth
// for gating (never the client — CLAUDE.md guardrail #2, #4).
import "server-only";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { toEntitlementContext } from "./entitlements";
import type { EntitlementContext, KycStatus, Plan, Profile, SubStatus } from "./types";

export interface KolabUser {
  id: string;
}

export function kolabDb() {
  const db = getDb();
  if (!db) throw new Error("DATABASE_URL is not set");
  return db.schema("kolab");
}
export type KolabDb = ReturnType<typeof kolabDb>;

/** The currently authenticated user, or null. */
export async function getSessionUser(): Promise<KolabUser | null> {
  const id = (await getServerSession(authOptions))?.user?.email;
  return id ? { id } : null;
}

/** Load the signed-in user's profile. */
export async function getMyProfile(): Promise<Profile | null> {
  const user = await getSessionUser();
  if (!user) return null;
  const { data } = await kolabDb().from("profiles").select("*").eq("user_id", user.id).maybeSingle();
  return (data as Profile | null) ?? null;
}

/**
 * Authoritative, server-computed entitlement context for the signed-in user.
 * Reads profile.privileged, kyc_verifications.status, subscriptions.status/plan.
 */
export async function getEntitlementContext(): Promise<EntitlementContext> {
  const user = await getSessionUser();
  if (!user) return toEntitlementContext({ profile: null, kyc: null, subscription: null });
  const db = kolabDb();
  const [{ data: profile }, { data: kyc }, { data: sub }] = await Promise.all([
    db.from("profiles").select("privileged").eq("user_id", user.id).maybeSingle(),
    db.from("kyc_verifications").select("status").eq("user_id", user.id).maybeSingle(),
    db.from("subscriptions").select("status, plan").eq("user_id", user.id).maybeSingle(),
  ]);
  return toEntitlementContext({
    profile: (profile as { privileged: boolean } | null) ?? null,
    kyc: (kyc as { status: KycStatus } | null) ?? null,
    subscription: (sub as { status: SubStatus; plan: Plan | null } | null) ?? null,
  });
}
