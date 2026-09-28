import { NextResponse } from "next/server";
import { enter } from "@/lib/phoneAuth";

export const runtime = "nodejs";

// The pre-flight for phone sign-in: given a number, say whether this person
// already has an account, so the form knows whether to ask for a name (sign-up)
// or a PIN (sign-in).
//
// THIS ROUTE NEVER TAKES A PIN. Verifying one has to set the session cookie,
// which only NextAuth can do, so the PIN goes to the `phone` credentials
// provider in lib/auth.ts and there is exactly one place that checks it.
//
// Answering "is this number registered" is a real disclosure, and it is the
// price of asking for a name only when there is no account yet. What it does
// not give anyone is a way in: the PIN is checked elsewhere, five wrong tries
// lock the account for fifteen minutes, and this route cannot reach that path.
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { phone?: unknown; cc?: unknown };
  const res = await enter({ phone: body.phone, cc: body.cc });

  if (res.ok) {
    // Unreachable without a PIN: `enter` only succeeds once one is verified or set.
    return NextResponse.json({ ok: true, exists: true, name: res.user.name });
  }

  switch (res.reason) {
    case "unconfigured":
      return NextResponse.json({ ok: false, error: res.error }, { status: 503 });
    case "bad_phone":
      return NextResponse.json({ ok: false, error: res.error }, { status: 400 });
    case "need_name":
      return NextResponse.json({ ok: true, exists: false });
    case "need_pin":
      return NextResponse.json({ ok: true, exists: true, name: res.name });
    case "set_pin":
      return NextResponse.json({ ok: true, exists: true, setPin: true, name: res.name });
    case "locked":
      return NextResponse.json({ ok: false, locked: true, error: res.error }, { status: 429 });
    default:
      return NextResponse.json({ ok: false, error: "Could not check that number." }, { status: 400 });
  }
}
