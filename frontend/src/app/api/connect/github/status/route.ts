import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getGithubAccessToken } from "@/lib/github";

export const runtime = "nodejs";

// Connected means GitHub still accepts the stored token, not just that one is
// on file: a revoked or expired token read "Connected" while every call failed.
export async function GET() {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) return NextResponse.json({ connected: false }, { status: 401 });
  const grant = await getGithubAccessToken(email).catch(() => null);
  const check = grant
    ? await fetch("https://api.github.com/user", {
      headers: { Authorization: `Bearer ${grant.token}`, Accept: "application/vnd.github+json", "User-Agent": "the-third-eye" },
      signal: AbortSignal.timeout(10_000),
    }).catch(() => null)
    : null;
  const expired = check?.status === 401;
  return NextResponse.json(
    {
      connected: !!grant && !expired,
      expired,
      login: grant?.login ?? null,
      configured: !!(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
