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
  const finish = (result: string, why?: string) => {
    if (why) console.error(`[connect/huggingface] ${why}`);
    const r = NextResponse.redirect(`${base}/settings?tab=agent&connect=${result}${why ? `&why=${encodeURIComponent(why.slice(0, 120))}` : ""}`);
    r.cookies.set("hf_connect", "", { maxAge: 0, path: "/api/connect/huggingface" });
    return r;
  };
  const denied = url.searchParams.get("error");
  if (denied) return finish("huggingface_error", `Hugging Face said: ${url.searchParams.get("error_description") ?? denied}`);
  // The state must come back exactly as this browser sent it, so a code from someone else's sign-in can't be attached here.
  if (!code || !state || !verifier || url.searchParams.get("state") !== state) return finish("huggingface_error", "The sign-in expired or was started in another browser.");

  const client = `${base}/.well-known/oauth-cimd`;
  const res = await fetch(HF_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: `${base}/api/connect/huggingface/callback`, client_id: client, code_verifier: verifier }),
  }).catch(() => null);
  if (!res?.ok) {
    const body = (await res?.json().catch(() => null)) as { error?: string; error_description?: string } | null;
    return finish("huggingface_error", `Hugging Face refused the sign-in (${res?.status ?? "no answer"}${body?.error_description ? `: ${body.error_description}` : body?.error ? `: ${body.error}` : ""}).`);
  }
  const tokens = await res.json().catch(() => ({}));
  if (!(await saveHuggingFace(email, client, tokens))) return finish("huggingface_error", "Signed in, but the token couldn't be saved. The database may be down.");
  return finish("huggingface_connected");
}
