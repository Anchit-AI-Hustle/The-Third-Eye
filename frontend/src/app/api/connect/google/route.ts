import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { INGESTION_SCOPES, originFromRequest } from "@/lib/googleToken";

export const runtime = "nodejs";

// Opt-in: start an OAuth flow that requests the Gmail/Chat ingestion scopes for
// the signed-in user. Kept separate from sign-in so basic login stays free of
// sensitive scopes (which would otherwise force OAuth verification).
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) return new NextResponse("Not authenticated", { status: 401 });

  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) return new NextResponse("Google client not configured", { status: 501 });

  const state = randomUUID();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${originFromRequest(req)}/api/connect/google/callback`,
    response_type: "code",
    scope: INGESTION_SCOPES,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    login_hint: email,
    state,
  });

  const res = NextResponse.redirect(
    `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
  );
  res.cookies.set("g_connect_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return res;
}
