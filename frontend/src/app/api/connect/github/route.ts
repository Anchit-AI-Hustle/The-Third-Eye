import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { originFromRequest } from "@/lib/googleToken";
import { revokeGithubAccess } from "@/lib/github";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) return new NextResponse("Not authenticated", { status: 401 });

  const clientId = process.env.GITHUB_CLIENT_ID;
  if (!clientId) return new NextResponse("GitHub client not configured", { status: 501 });

  const state = randomUUID();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${originFromRequest(req)}/api/connect/github/callback`,
    scope: "read:user repo",
    state,
  });
  const res = NextResponse.redirect(`https://github.com/login/oauth/authorize?${params.toString()}`);
  res.cookies.set("gh_connect_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return res;
}

export async function DELETE() {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const ok = await revokeGithubAccess(email);
  return NextResponse.json({ ok }, { headers: { "Cache-Control": "no-store" } });
}
