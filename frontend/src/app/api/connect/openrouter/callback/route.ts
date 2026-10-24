import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { originFromRequest } from "@/lib/googleToken";
import { saveOwnKey } from "@/lib/providerKeys";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const base = originFromRequest(req);
  const email = (await getServerSession(authOptions))?.user?.email;
  if (!email) return NextResponse.redirect(`${base}/auth/signin`);

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const [state, verifier] = (req.headers.get("cookie") ?? "").split(";").map((c) => c.trim())
    .find((c) => c.startsWith("or_connect="))?.slice("or_connect=".length).split(".") ?? [];
  const finish = (result: string) => {
    const r = NextResponse.redirect(`${base}/settings?tab=agent&connect=${result}`);
    r.cookies.set("or_connect", "", { maxAge: 0, path: "/api/connect/openrouter" });
    return r;
  };
  // The state must come back exactly as this browser sent it, so a code from someone else's sign-in can't be attached here.
  if (!code || !state || !verifier || url.searchParams.get("state") !== state) return finish("openrouter_error");

  const res = await fetch("https://openrouter.ai/api/v1/auth/keys", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, code_verifier: verifier, code_challenge_method: "S256" }),
  }).catch(() => null);
  const key = res?.ok ? ((await res.json().catch(() => ({}))) as { key?: string }).key : undefined;
  if (!key) return finish("openrouter_error");
  return finish((await saveOwnKey(email, "openrouter", key)) ? "openrouter_connected" : "openrouter_error");
}
