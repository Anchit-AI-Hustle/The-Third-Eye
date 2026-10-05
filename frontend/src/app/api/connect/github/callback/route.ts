import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { originFromRequest } from "@/lib/googleToken";
import { storeGithubToken } from "@/lib/github";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const base = originFromRequest(req);
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) return NextResponse.redirect(`${base}/auth/signin`);

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieState = req.headers
    .get("cookie")
    ?.split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith("gh_connect_state="))
    ?.split("=")[1];

  if (!code || !state || !cookieState || state !== cookieState) {
    return NextResponse.redirect(`${base}/settings?connect=github_error`);
  }

  const res = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_id: process.env.GITHUB_CLIENT_ID ?? "",
      client_secret: process.env.GITHUB_CLIENT_SECRET ?? "",
      code,
      redirect_uri: `${base}/api/connect/github/callback`,
    }),
  });
  const tok = (await res.json().catch(() => ({}))) as { access_token?: string };
  if (!res.ok || !tok.access_token) {
    const fail = NextResponse.redirect(`${base}/settings?connect=github_error`);
    fail.cookies.delete("gh_connect_state");
    return fail;
  }

  let login: string | null = null;
  try {
    const me = await fetch("https://api.github.com/user", {
      headers: { Authorization: `Bearer ${tok.access_token}`, Accept: "application/vnd.github+json", "User-Agent": "the-third-eye" },
    });
    if (me.ok) login = ((await me.json()) as { login?: string }).login ?? null;
  } catch { /* login is display-only */ }

  await storeGithubToken(email, tok.access_token, login);
  const done = NextResponse.redirect(`${base}/settings?connect=github_connected`);
  done.cookies.delete("gh_connect_state");
  return done;
}
