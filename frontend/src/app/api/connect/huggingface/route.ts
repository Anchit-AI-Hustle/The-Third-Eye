import { createHash, randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { originFromRequest } from "@/lib/googleToken";
import { HF_SCOPES } from "@/lib/providerKeys";

export const runtime = "nodejs";

// "Sign in with Hugging Face" (OAuth PKCE): the user approves on huggingface.co
// and their chats then run on their own Hugging Face account's inference credit.
export async function GET(req: Request) {
  if (!(await getServerSession(authOptions))?.user?.email) return new NextResponse("Not authenticated", { status: 401 });
  const origin = originFromRequest(req);
  const verifier = randomBytes(32).toString("base64url");
  const state = randomBytes(16).toString("base64url");
  const params = new URLSearchParams({
    client_id: `${origin}/.well-known/oauth-cimd`,
    redirect_uri: `${origin}/api/connect/huggingface/callback`,
    response_type: "code",
    scope: HF_SCOPES,
    state,
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
  });
  const res = NextResponse.redirect(`https://huggingface.co/oauth/authorize?${params.toString()}`);
  res.cookies.set("hf_connect", `${state}.${verifier}`, {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: 600, path: "/api/connect/huggingface",
  });
  return res;
}
