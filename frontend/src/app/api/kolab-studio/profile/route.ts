// web/app/api/profile/route.ts — server-validated profile upsert.
// authN (session) → authZ (own row, keyed by the session's user_id) → validate (zod) → act → audit.
import { getSessionUser, getEntitlementContext, kolabDb } from "@/lib/kolab-studio/db";
import { profileUpdateSchema } from "@/lib/kolab-studio/validation";
import { isProfileComplete, canUsePro } from "@/lib/kolab-studio/entitlements";
import { ok, fail, handleError, clientIp } from "@/lib/kolab-studio/http";
import { audit } from "@/lib/kolab-studio/audit";

export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return fail("Not authenticated", 401);

    const input = profileUpdateSchema.parse(await req.json());
    const db = kolabDb();

    // website_url is a Pro-only field. The client disables it for non-Pro users, but a direct
    // POST must not bypass the paid gate — enforce entitlement server-side (CLAUDE.md guardrail #2).
    const canPro = canUsePro(await getEntitlementContext());

    // Read current values to compute completeness across the merged result.
    const { data: current } = await db
      .from("profiles")
      .select("name, dob, pincode")
      .eq("user_id", user.id)
      .maybeSingle();

    const merged = {
      name: input.name ?? (current as any)?.name ?? null,
      dob: input.dob ?? (current as any)?.dob ?? null,
      pincode: input.pincode ?? (current as any)?.pincode ?? null,
    };

    // Only allow-listed, non-sensitive fields. `privileged`/`role`/KYC are NOT client-writable
    // website_url is accepted but Pro-gating is enforced
    // by the caller/entitlement; here we just persist what was allowed through.
    const patch = {
      user_id: user.id,
      is_complete: isProfileComplete(merged),
      updated_at: new Date().toISOString(),
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.handle !== undefined ? { handle: input.handle.replace(/^@/, "") } : {}),
      ...(input.dob !== undefined ? { dob: input.dob } : {}),
      ...(input.pincode !== undefined ? { pincode: input.pincode } : {}),
      ...(input.website_url !== undefined && canPro ? { website_url: input.website_url } : {}),
    };

    const { error } = await db.from("profiles").upsert(patch, { onConflict: "user_id" });
    if (error) return fail("Could not save profile", 400);

    await audit({
      actorId: user.id,
      action: "profile.update",
      entity: "profiles",
      entityId: user.id,
      ip: clientIp(req),
      meta: { fields: Object.keys(patch).filter((k) => k !== "user_id") },
    });
    return ok({ is_complete: patch.is_complete });
  } catch (e) {
    return handleError(e);
  }
}
