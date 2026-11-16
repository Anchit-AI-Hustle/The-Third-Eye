import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { originFromRequest } from "@/lib/googleToken";
import { revokeGithubAccess, storeGithubToken } from "@/lib/github";

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
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return res;
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  try {
    const { token } = (await req.json().catch(() => ({}))) as { token?: string };
    const cleanToken = String(token ?? "").trim();
    if (!cleanToken) {
      return NextResponse.json({ error: "Please enter a valid GitHub Personal Access Token" }, { status: 400 });
    }

    const res = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${cleanToken}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "the-third-eye",
      },
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return NextResponse.json(
        { error: `Invalid GitHub token (${res.status}): ${errText.slice(0, 100) || "Unauthorized"}` },
        { status: 400 },
      );
    }

    const userData = (await res.json()) as { login?: string };
    const login = userData.login || null;
    const ok = await storeGithubToken(email, cleanToken, login);
    if (!ok) {
      return NextResponse.json({ error: "Your token is valid, but the app couldn't save it on its side. Nothing is wrong with the token." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, login, configured: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Error connecting GitHub" }, { status: 500 });
  }
}

export async function DELETE() {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const ok = await revokeGithubAccess(email);
  return NextResponse.json({ ok }, { headers: { "Cache-Control": "no-store" } });
}
