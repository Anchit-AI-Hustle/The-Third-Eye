import { NextResponse } from "next/server";
import { clientIp, enter } from "@/lib/phoneAuth";

export const runtime = "nodejs";

// The pre-flight for phone sign-in: given a number, say whether this person
// already has an account, so the form knows whether to ask for a name (sign-up)
// or a PIN (sign-in).
//
// THIS ROUTE NEVER TAKES A PIN. Verifying one has to set the session cookie,
// which only NextAuth can do, so the PIN goes to the `phone` credentials
// provider in lib/auth.ts and there is exactly one place that checks it.
//
// WHAT IT DELIBERATELY DOES NOT SAY. It is unauthenticated — middleware does not
// cover /api/* — so everything it returns is returned to anyone who can guess a
// number. It answers one bit: is this number registered. It used to also hand
// back the account holder's NAME, which turns a list of numbers into a list of
// people and hands a phisher "Welcome back, <name>" for free; and it
// distinguished a locked account with a 429, which confirms to an attacker that
// their lockout attack landed. Both are gone: a known number gets one answer
// whatever state it is in, and the lock is reported only to someone who actually
// submits a PIN.
//
// Knowing that a number is registered is the irreducible cost of asking for a
// name only when there is no account yet. It is bounded by the rate limit below,
// and it is not a way in: the PIN is checked elsewhere, and five wrong tries
// lock the account.
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { phone?: unknown; cc?: unknown };
  const res = await enter({ phone: body.phone, cc: body.cc, ip: clientIp(req.headers) });

  if (res.ok) {
    // Unreachable without a PIN: `enter` only succeeds once one is verified or set.
    return NextResponse.json({ ok: true, exists: true });
  }

  switch (res.reason) {
    case "unconfigured":
      return NextResponse.json({ ok: false, error: res.error }, { status: 503 });
    case "bad_phone":
      return NextResponse.json({ ok: false, error: res.error }, { status: 400 });
    case "rate_limited":
      return NextResponse.json({ ok: false, error: res.error }, { status: 429 });
    case "need_name":
      return NextResponse.json({ ok: true, exists: false });
    // A known number, whether it is waiting for a PIN or currently locked out.
    // Same answer either way — see the note above.
    case "need_pin":
    case "locked":
      return NextResponse.json({ ok: true, exists: true });
    default:
      return NextResponse.json({ ok: false, error: "Could not check that number." }, { status: 400 });
  }
}
