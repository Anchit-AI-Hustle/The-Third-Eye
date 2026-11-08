import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { originFromRequest } from "@/lib/googleToken";
import { PLATFORMS, PROVIDERS, providerConfig, saveAccounts, type Platform, type SocialAccount } from "@/lib/social";

export const runtime = "nodejs";

const cookie = (req: Request, name: string) => req.headers.get("cookie")?.split(";").map((c) => c.trim()).find((c) => c.startsWith(`${name}=`))?.slice(name.length + 1);

export async function GET(req: Request, ctx: { params: Promise<{ platform: string }> }) {
  const { platform: raw } = await ctx.params;
  const base = originFromRequest(req);
  const email = (await getServerSession(authOptions))?.user?.email;
  if (!email) return NextResponse.redirect(`${base}/auth/signin`);
  const platform = raw as Platform;
  const back = (status: string) => {
    const r = NextResponse.redirect(`${base}/settings?tab=account&social=${status}`);
    r.cookies.delete("social_state");
    r.cookies.delete("social_verifier");
    return r;
  };
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const cfg = PLATFORMS.includes(platform) ? providerConfig(platform) : null;
  if (!cfg || !code || cookie(req, "social_state") !== `${platform}:${url.searchParams.get("state")}`) return back(`${raw}_error`);

  try {
    const got = await PROVIDERS[platform].accounts(code, `${base}/api/connect/social/${platform}/callback`, cookie(req, "social_verifier"), cfg);
    const groups = (got.length && "list" in got[0] ? got : [{ platform, list: got }]) as { platform: Platform; list: Omit<SocialAccount, "platform">[] }[];
    let saved = 0;
    for (const g of groups) saved += await saveAccounts(email, g.platform, g.list);
    return back(saved ? `${platform}_connected` : `${platform}_none`);
  } catch (e) {
    console.error(`social connect ${platform}:`, e instanceof Error ? e.message : e);
    return back(`${platform}_error`);
  }
}
