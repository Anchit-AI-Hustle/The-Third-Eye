import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { CONNECT_SCOPES, canConnectGoogle, originFromRequest, revokeGoogleAccess } from "@/lib/googleToken";

export const runtime = "nodejs";

// Opt-in: start an OAuth flow that requests the Gmail ingestion scopes for
// the signed-in user. Kept separate from sign-in so basic login stays free of
// sensitive scopes (which would otherwise force OAuth verification).
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) return new NextResponse("Not authenticated", { status: 401 });
  if (!canConnectGoogle(email)) {
    return NextResponse.redirect(`${originFromRequest(req)}/settings?connect=google_pending`);
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) return new NextResponse("Google client not configured", { status: 501 });

  const state = randomUUID();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${originFromRequest(req)}/api/connect/google/callback`,
    response_type: "code",
    // Feature scopes plus identity — see CONNECT_SCOPES for why identity is in
    // there and why it does not change what "connected" means.
    scope: CONNECT_SCOPES,
    access_type: "offline",
    prompt: "consent",
    // No incremental auth: it would fold in scopes granted before the narrowing
    // (calendar.readonly, the Chat scopes), so the stored grant would outgrow
    // the three under verification.
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

// Disconnect: revoke the grant at Google and drop the stored refresh token,
// without deleting the account. Previously the only way to withdraw Gmail
// access was to delete everything.
export async function DELETE() {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const result = await revokeGoogleAccess(email);
  return NextResponse.json(
    { ok: result.cleared, ...result },
    { headers: { "Cache-Control": "no-store" } },
  );
}
