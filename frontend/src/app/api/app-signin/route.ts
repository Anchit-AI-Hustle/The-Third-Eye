import { randomBytes } from "node:crypto";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { approveHandoff, startHandoff } from "@/lib/authHandoff";

export const dynamic = "force-dynamic";

// The apps open this in a system browser (iOS sign-in sheet, Android's
// browser). Signed out: straight to Google, which comes back here. Signed in:
// a fresh code, approved for this account, goes back to the app through its
// own URL scheme and the app claims it at GET /api/auth/handoff. The code is
// made here, so no one else can have started it and nothing needs approving.
//
// The app sends a random state of its own and accepts a code only when the same
// state comes back with it. Without that, any web page could open
// thethirdeye://auth?code=<its own approved code> and sign the app into the
// page owner's account, where everything the person then saves would land.
const STATE = /^[A-Za-z0-9_-]{16,128}$/;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const origin = url.origin;
  const raw = url.searchParams.get("state");
  const state = raw && STATE.test(raw) ? raw : null;
  const email = (await getServerSession(authOptions))?.user?.email;
  if (!email) return Response.redirect(`${origin}/auth/app${state ? `?state=${state}` : ""}`, 303);
  const db = getDb();
  if (!db) return new Response("Sign-in is unavailable right now.", { status: 503 });
  const code = randomBytes(32).toString("hex");
  await startHandoff(db, code);
  await approveHandoff(db, code, email);
  const back = `thethirdeye://auth?code=${code}${state ? `&state=${state}` : ""}`;
  // A page, not a redirect: Android's browser only opens an app from a page
  // the person can tap if the automatic hop is blocked.
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="0;url=${back}"><title>Signed in - The Third Eye</title></head><body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#050505;color:#e8eaf0;font-family:system-ui,sans-serif;text-align:center"><div><p>Signed in. Opening The Third Eye.</p><p><a href="${back}" style="color:#4fc3f7">Open the app</a></p></div></body></html>`;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}
