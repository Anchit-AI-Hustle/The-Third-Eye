// web/app/api/org/create/route.ts — create an organization + owner membership (spec §2).
// authN → validate → create org (created_by = user) → add the creator as owner → set active-org cookie.
// RLS lets any authenticated user create an org and self-insert their owner membership (0003).
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/kolab-studio/db";
import { supabaseServer } from "@/lib/kolab-studio/supabaseServer";
import { orgCreateSchema } from "@/lib/kolab-studio/validation";
import { ACTIVE_ORG_COOKIE } from "@/lib/kolab-studio/org";
import { fail, handleError, clientIp } from "@/lib/kolab-studio/http";
import { audit } from "@/lib/kolab-studio/audit";

export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return fail("Not authenticated", 401);

    const { type, name, vertical } = orgCreateSchema.parse(await req.json());
    const supabase = supabaseServer();

    const { data: org, error: orgErr } = await supabase
      .from("organizations")
      .insert({ name, type, vertical: vertical ?? null, created_by: user.id, seats: 1 })
      .select("id")
      .single();
    if (orgErr || !org) return fail("Could not create organization", 400);

    const orgId = (org as { id: string }).id;
    const { error: memErr } = await supabase
      .from("memberships")
      .insert({ org_id: orgId, user_id: user.id, role: "owner" });
    if (memErr) return fail("Could not create membership", 400);

    await audit({
      actorId: user.id,
      action: "org.create",
      entity: "organizations",
      entityId: orgId,
      ip: clientIp(req),
      meta: { type },
    });

    const res = NextResponse.json({ ok: true, data: { id: orgId } });
    res.cookies.set(ACTIVE_ORG_COOKIE, orgId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
    return res;
  } catch (e) {
    return handleError(e);
  }
}
