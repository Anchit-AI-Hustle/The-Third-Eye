import { encode } from "next-auth/jwt";
import { getDb } from "@/lib/db";
import { claimHandoff, startHandoff, validCode } from "@/lib/authHandoff";
import { authUsesSecureCookies, sessionCookieName } from "@/lib/authCookies";
import { resolveAuthSecret } from "@/lib/authSecret";

const SESSION_SECONDS = 24 * 60 * 60;

// POST: the app registers its code before opening /auth/handoff in Safari.
export async function POST(req: Request) {
  const { code } = (await req.json().catch(() => ({}))) as { code?: unknown };
  const db = getDb();
  if (!validCode(code) || !db) return Response.json({ error: "bad code" }, { status: 400 });
  await startHandoff(db, code);
  return new Response(null, { status: 204 });
}

// GET: the app polls; once approved it gets its own session cookie, once.
export async function GET(req: Request) {
  const code = new URL(req.url).searchParams.get("code");
  const db = getDb();
  if (!validCode(code) || !db) return Response.json({ error: "bad code" }, { status: 400 });
  const email = await claimHandoff(db, code);
  if (!email) return Response.json({ signedIn: false });
  const secure = authUsesSecureCookies();
  const token = await encode({ token: { email, sub: email }, secret: resolveAuthSecret(), maxAge: SESSION_SECONDS });
  const cookie = `${sessionCookieName(secure)}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_SECONDS}${secure ? "; Secure" : ""}`;
  return Response.json({ signedIn: true }, { headers: { "Set-Cookie": cookie } });
}
