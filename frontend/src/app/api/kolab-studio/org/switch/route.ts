// web/app/api/org/switch/route.ts — set the active org (validated against the user's memberships).
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/kolab-studio/db";
import { getMyMemberships, ACTIVE_ORG_COOKIE } from "@/lib/kolab-studio/org";
import { fail, handleError } from "@/lib/kolab-studio/http";

const schema = z.object({ org_id: z.string().uuid() });

export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return fail("Not authenticated", 401);

    const { org_id } = schema.parse(await req.json());
    const memberships = await getMyMemberships();
    if (!memberships.some((m) => m.org.id === org_id)) return fail("Not a member of that org", 403);

    const res = NextResponse.json({ ok: true, data: { org_id } });
    res.cookies.set(ACTIVE_ORG_COOKIE, org_id, {
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
