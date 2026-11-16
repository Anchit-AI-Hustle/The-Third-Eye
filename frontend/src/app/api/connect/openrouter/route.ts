import { createHash, randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { originFromRequest } from "@/lib/googleToken";

export const runtime = "nodejs";

// "Sign in with OpenRouter" (OAuth PKCE): the user approves on openrouter.ai and
// we receive an API key on their own OpenRouter account, saved like a pasted key.
export async function GET(req: Request) {
  if (!(await getServerSession(authOptions))?.user?.email) return new NextResponse("Not authenticated", { status: 401 });
  const verifier = randomBytes(32).toString("base64url");
  const state = randomBytes(16).toString("base64url");
  const params = new URLSearchParams({
    callback_url: `${originFromRequest(req)}/api/connect/openrouter/callback`,
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
    state,
    key_label: "The Third Eye",
  });
  const res = NextResponse.redirect(`https://openrouter.ai/auth?${params.toString()}`);
  res.cookies.set("or_connect", `${state}.${verifier}`, {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: 600, path: "/api/connect/openrouter",
  });
  return res;
}
