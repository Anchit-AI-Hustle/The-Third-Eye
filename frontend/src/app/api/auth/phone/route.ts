import { NextResponse } from "next/server";

export const runtime = "nodejs";

// Phone + PIN sign-in is retired. Auth is Google only (lib/auth.ts). This route
// stays as a hard 410 so old clients get a clear answer instead of a half-live
// preflight that can never mint a session.
export async function POST() {
  return NextResponse.json(
    { ok: false, error: "Phone sign-in is no longer available. Sign in with Google." },
    { status: 410 },
  );
}
