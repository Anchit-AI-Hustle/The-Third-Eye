import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { originFromRequest } from "@/lib/googleToken";
import { HF_TOKEN_URL, saveHuggingFace } from "@/lib/providerKeys";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const base = originFromRequest(req);
  const email = (await getServerSession(authOptions))?.user?.email;
  if (!email) return NextResponse.redirect(`${base}/auth/signin`);

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const [state, verifier] = (req.headers.get("cookie") ?? "").split(";").map((c) => c.trim())
    .find((c) => c.startsWith("hf_connect="))?.slice("hf_connect=".length).split(".") ?? [];
  const finish = (result: string) => {
    const r = NextResponse.redirect(`${base}/settings?tab=agent&connect=${result}`);
    r.cookies.set("hf_connect", "", { maxAge: 0, path: "/api/connect/huggingface" });
    return r;
  };
  // The state must come back exactly as this browser sent it, so a code from someone else's sign-in can't be attached here.
  if (!code || !state || !verifier || url.searchParams.get("state") !== state) return finish("huggingface_error");

  const client = `${base}/.well-known/oauth-cimd`;
  const res = await fetch(HF_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: `${base}/api/connect/huggingface/callback`, client_id: client, code_verifier: verifier }),
  }).catch(() => null);
  const tokens = res?.ok ? await res.json().catch(() => ({})) : {};
  return finish((await saveHuggingFace(email, client, tokens)) ? "huggingface_connected" : "huggingface_error");
}
