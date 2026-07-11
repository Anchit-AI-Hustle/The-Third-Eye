import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { saveCredentials } from "@/lib/integrations";
import { shopInfo } from "@/lib/shopify";

export const runtime = "nodejs";

// Save a Shopify custom-app Admin API token for the signed-in user. Validates
// the token against the shop before storing it (encrypted).
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { shop?: string; token?: string };
  const shop = (body.shop ?? "").trim();
  const token = (body.token ?? "").trim();
  if (!shop || !token) {
    return NextResponse.json({ error: "shop and token are required" }, { status: 400 });
  }

  const info = await shopInfo({ shop, token });
  if (!info) {
    return NextResponse.json({ error: "Could not authenticate with Shopify — check the shop domain and token." }, { status: 400 });
  }

  const ok = await saveCredentials(email, "shopify", { shop, token }, { name: info.name, domain: info.domain });
  if (!ok) return NextResponse.json({ error: "Failed to store credentials (Supabase/encryption not configured)." }, { status: 501 });

  return NextResponse.json({ ok: true, shop: info.name ?? shop });
}
