import { encode } from "next-auth/jwt";
import { getDb } from "@/lib/db";
import { browserKey, claimBrowserHandoff, claimHandoff, startHandoff, validCode } from "@/lib/authHandoff";
import { authUsesSecureCookies, sessionCookieName } from "@/lib/authCookies";
import { resolveAuthSecret } from "@/lib/authSecret";

const SESSION_SECONDS = 24 * 60 * 60;

// POST: the app registers its code before opening /auth/handoff in Safari.
export async function POST(req: Request) {
  const { code } = (await req.json().catch(() => ({}))) as { code?: unknown };
  const db = getDb();
  if (!validCode(code) || !db) return Response.json({ error: "bad code" }, { status: 400 });
  await startHandoff(db, browserKey(code));
  return new Response(null, { status: 204 });
}

// GET: the app claims an approved code for its own session cookie, once. A
// browser-started code also needs the confirmation Safari showed.
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const code = params.get("code");
  const confirm = params.get("confirm");
  const db = getDb();
  if (!validCode(code) || !db) return Response.json({ error: "bad code" }, { status: 400 });
  const email = confirm === null ? await claimHandoff(db, code) : await claimBrowserHandoff(db, code, confirm);
  if (!email) return Response.json({ signedIn: false });
  const secure = authUsesSecureCookies();
  const token = await encode({ token: { email, sub: email }, secret: resolveAuthSecret(), maxAge: SESSION_SECONDS });
  const cookie = `${sessionCookieName(secure)}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_SECONDS}${secure ? "; Secure" : ""}`;
  return Response.json({ signedIn: true }, { headers: { "Set-Cookie": cookie } });
}
