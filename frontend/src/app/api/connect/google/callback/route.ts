import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getAdminSupabase } from "@/lib/serverSupabase";
import { encrypt } from "@/lib/crypto";
import { originFromRequest } from "@/lib/googleToken";

export const runtime = "nodejs";

// Completes the opt-in Google connect flow: exchanges the code for a refresh
// token carrying the Gmail/Chat scopes and stores it (encrypted) for the user.
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
    .find((c) => c.startsWith("g_connect_state="))
    ?.split("=")[1];

  if (!code || !state || !cookieState || state !== cookieState) {
    return NextResponse.redirect(`${base}/settings?connect=google_error`);
  }

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      grant_type: "authorization_code",
      code,
      redirect_uri: `${base}/api/connect/google/callback`,
    }),
  });
  if (!res.ok) {
    console.error("google connect token exchange failed:", await res.text().catch(() => ""));
    return NextResponse.redirect(`${base}/settings?connect=google_error`);
  }

  const tok = (await res.json()) as { refresh_token?: string; scope?: string };
  const sb = getAdminSupabase();
  if (tok.refresh_token && sb) {
    const enc = encrypt(tok.refresh_token);
    if (enc) {
      await sb.from("google_tokens").upsert(
        { user_id: email, refresh_token_enc: enc, scope: tok.scope, updated_at: new Date().toISOString() },
        { onConflict: "user_id" },
      );
    }
  }

  const done = NextResponse.redirect(`${base}/settings?connect=google_connected`);
  done.cookies.delete("g_connect_state");
  return done;
}
