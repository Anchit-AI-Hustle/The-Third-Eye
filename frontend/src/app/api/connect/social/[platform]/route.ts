import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { originFromRequest } from "@/lib/googleToken";
import { PLATFORMS, authorizeUrl, providerConfig, type Platform } from "@/lib/social";

export const runtime = "nodejs";

// Starts a person's own sign-in to a social platform. Instagram comes through
// the same Meta login as Facebook Pages, so both use the facebook flow.
export async function GET(req: Request, ctx: { params: Promise<{ platform: string }> }) {
  const { platform: raw } = await ctx.params;
  const base = originFromRequest(req);
  if (!(await getServerSession(authOptions))?.user?.email) return NextResponse.redirect(`${base}/auth/signin`);
  if (!PLATFORMS.includes(raw as Platform)) return new NextResponse("Unknown platform", { status: 404 });
  const platform: Platform = raw === "instagram" ? "facebook" : (raw as Platform);
  if (!providerConfig(platform)) return NextResponse.redirect(`${base}/settings?tab=account&social=${platform}_not_set_up`);

  const state = randomUUID();
  const { url, verifier } = authorizeUrl(platform, `${base}/api/connect/social/${platform}/callback`, state);
  const res = NextResponse.redirect(url);
  const cookie = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, maxAge: 600, path: "/" };
  res.cookies.set("social_state", `${platform}:${state}`, cookie);
  if (verifier) res.cookies.set("social_verifier", verifier, cookie);
  return res;
}
