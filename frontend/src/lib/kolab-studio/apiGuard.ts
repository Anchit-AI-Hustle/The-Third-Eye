// web/lib/apiGuard.ts
// Shared authN + feature-gate for studio mutation routes. Returns either the authenticated
// user + Kolab database, or a ready-to-return error Response. Keeps every route's preamble
// uniform: authN → authZ(feature gate) → (route does) validate → act → audit. The database is
// not user-scoped: every query the route makes must filter by user.id.
import "server-only";
import { getSessionUser, getEntitlementContext, kolabDb, type KolabDb, type KolabUser } from "./db";
import { canUseFeatures } from "./entitlements";
import { fail } from "./http";

export type GateResult =
  | { ok: true; user: KolabUser; db: KolabDb }
  | { ok: false; response: Response };

/** Require an authenticated, feature-entitled user (KYC + subscription/privileged). */
export async function requireFeatureAccess(): Promise<GateResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, response: fail("Not authenticated", 401) };

  const ctx = await getEntitlementContext();
  if (!canUseFeatures(ctx)) {
    return { ok: false, response: fail("Verify Aadhaar and subscribe to use this feature", 403) };
  }
  return { ok: true, user, db: kolabDb() };
}
