import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { approveHandoff, validCode } from "@/lib/authHandoff";

// The signed-in person (in Safari) approves the app's code. A same-origin
// form post only, so another site cannot approve on their behalf.
export async function POST(req: Request) {
  const url = new URL(req.url);
  if (req.headers.get("origin") !== url.origin) return new Response("Forbidden", { status: 403 });
  const email = (await getServerSession(authOptions))?.user?.email;
  if (!email) return new Response("Sign in first", { status: 401 });
  const code = (await req.formData()).get("code");
  const db = getDb();
  if (!validCode(code) || !db) return new Response("Bad code", { status: 400 });
  const ok = await approveHandoff(db, code, email);
  return Response.redirect(`${url.origin}/auth/handoff?code=${code}&${ok ? "done=1" : "expired=1"}`, 303);
}
