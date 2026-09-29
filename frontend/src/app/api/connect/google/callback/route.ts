import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getAdminSupabase } from "@/lib/serverSupabase";
import { encrypt } from "@/lib/crypto";
import { originFromRequest } from "@/lib/googleToken";

export const runtime = "nodejs";

/**
 * The address out of Google's id_token, without verifying the signature.
 *
 * Safe here and only here: this token came back over TLS from Google's own token
 * endpoint in direct response to our code exchange, so it is not attacker-
 * supplied. It is used as a delivery address for the user's own mail, never as
 * proof of identity — that is `session.user.email`, which this never touches.
 */
function emailFromIdToken(idToken: string | undefined): string | null {
  if (!idToken) return null;
  try {
    const payload = idToken.split(".")[1];
    if (!payload) return null;
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      email?: string;
      email_verified?: boolean;
    };
    return claims.email && claims.email_verified !== false ? claims.email : null;
  } catch {
    return null;
  }
}

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

  const tok = (await res.json()) as { refresh_token?: string; scope?: string; id_token?: string };

  // WHICH MAILBOX THIS GRANT IS FOR. Recorded here because this is the one moment
  // it is known for certain: the identity key is a phone number under phone
  // sign-in, and Gmail's users/me/profile refuses a send-only grant, so somebody
  // who allowed "send" and declined "read" would otherwise have a token that can
  // deliver their reminders and no address to deliver them to.
  const mailbox = emailFromIdToken(tok.id_token);
  const sb = getAdminSupabase();
  if (tok.refresh_token && sb) {
    const enc = encrypt(tok.refresh_token);
    if (enc) {
      await sb.from("google_tokens").upsert(
        {
          user_id: email,
          refresh_token_enc: enc,
          scope: tok.scope,
          ...(mailbox ? { email: mailbox } : {}),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );
    }
  }

  const done = NextResponse.redirect(`${base}/settings?connect=google_connected`);
  done.cookies.delete("g_connect_state");
  return done;
}
