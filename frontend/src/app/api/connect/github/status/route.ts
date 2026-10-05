import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getGithubAccessToken } from "@/lib/github";

export const runtime = "nodejs";

export async function GET() {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) return NextResponse.json({ connected: false }, { status: 401 });
  const grant = await getGithubAccessToken(email).catch(() => null);
  return NextResponse.json(
    { connected: !!grant, login: grant?.login ?? null, configured: !!(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
