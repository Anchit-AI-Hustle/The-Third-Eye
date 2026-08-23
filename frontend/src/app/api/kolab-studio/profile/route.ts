// web/app/api/profile/route.ts — server-validated profile upsert.
// authN (session) → authZ (own row via RLS) → validate (zod) → act → audit.
import { supabaseServer } from "@/lib/kolab-studio/supabaseServer";
import { getSessionUser, getEntitlementContext } from "@/lib/kolab-studio/db";
import { profileUpdateSchema } from "@/lib/kolab-studio/validation";
import { isProfileComplete, canUsePro } from "@/lib/kolab-studio/entitlements";
import { ok, fail, handleError, clientIp } from "@/lib/kolab-studio/http";
import { audit } from "@/lib/kolab-studio/audit";

export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return fail("Not authenticated", 401);

    const input = profileUpdateSchema.parse(await req.json());
    const supabase = await supabaseServer();

    // website_url is a Pro-only field. The client disables it for non-Pro users, but a direct
    // POST must not bypass the paid gate — enforce entitlement server-side (CLAUDE.md guardrail #2).
    const canPro = canUsePro(await getEntitlementContext());

    // Read current values to compute completeness across the merged result.
    const { data: current } = await supabase
      .from("profiles")
      .select("name, dob, pincode")
      .maybeSingle();

    const merged = {
      name: input.name ?? (current as any)?.name ?? null,
      dob: input.dob ?? (current as any)?.dob ?? null,
      pincode: input.pincode ?? (current as any)?.pincode ?? null,
    };

    // Only allow-listed, non-sensitive fields. `privileged`/`role`/KYC are NOT client-writable
    // (also enforced by RLS + column grants). website_url is accepted but Pro-gating is enforced
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

    const { error } = await supabase.from("profiles").upsert(patch, { onConflict: "user_id" });
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
