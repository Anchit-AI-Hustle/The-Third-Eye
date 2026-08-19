// web/lib/apiGuard.ts
// Shared authN + feature-gate for studio mutation routes. Returns either the authenticated
// user + RLS client, or a ready-to-return error Response. Keeps every route's preamble uniform:
// authN → authZ(feature gate) → (route does) validate → act → audit.
import "server-only";
import type { User } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSessionUser, getEntitlementContext } from "./db";
import { supabaseServer } from "./supabaseServer";
import { canUseFeatures } from "./entitlements";
import { fail } from "./http";
import type { Database } from "./database.types";

export type GateResult =
  | { ok: true; user: User; supabase: SupabaseClient<Database> }
  | { ok: false; response: Response };

/** Require an authenticated, feature-entitled user (KYC + subscription/privileged). */
export async function requireFeatureAccess(): Promise<GateResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, response: fail("Not authenticated", 401) };

  const ctx = await getEntitlementContext();
  if (!canUseFeatures(ctx)) {
    return { ok: false, response: fail("Verify Aadhaar and subscribe to use this feature", 403) };
  }
  return { ok: true, user, supabase: supabaseServer() };
}
