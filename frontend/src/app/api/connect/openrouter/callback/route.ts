import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { originFromRequest } from "@/lib/googleToken";

export const runtime = "nodejs";

// OpenRouter is excluded by the owner: a stray callback saves nothing and calls nothing.
export async function GET(req: Request) {
  const base = originFromRequest(req);
  if (!(await getServerSession(authOptions))?.user?.email) return NextResponse.redirect(`${base}/auth/signin`);
  const r = NextResponse.redirect(`${base}/settings?tab=agent&connect=openrouter_error&why=${encodeURIComponent("OpenRouter is not used by this app.")}`);
  r.cookies.set("or_connect", "", { maxAge: 0, path: "/api/connect/openrouter" });
  return r;
}
