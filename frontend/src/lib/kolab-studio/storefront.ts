// web/lib/storefront.ts
// PUBLIC storefront read (no auth). A follower opening a shared /s/<handle> link must see the
// CREATOR's active deals, not their own — so it reads by handle, not by session. It exposes
// ONLY public, storefront-appropriate columns (display name, handle, and active deals) —
// never PII, contact, KYC, or private fields.
import "server-only";
import { kolabDb } from "./db";
import type { Deal } from "./studio";

export interface PublicStorefront {
  name: string | null;
  handle: string;
  deals: Deal[];
}

export async function getPublicStorefront(handleInput: string): Promise<PublicStorefront | null> {
  const handle = handleInput.replace(/^@/, "").trim();
  if (!handle) return null;

  const admin = kolabDb();
  const { data: profile } = await admin
    .from("profiles")
    .select("user_id, name, handle")
    .eq("handle", handle)
    .maybeSingle();
  if (!profile) return null;

  const p = profile as { user_id: string; name: string | null; handle: string | null };
  const { data: deals } = await admin
    .from("deals")
    .select("id, brand, emoji, product, category, code, discount, price, affiliate_url, active")
    .eq("user_id", p.user_id)
    .eq("active", true)
    .order("created_at", { ascending: false });

  return { name: p.name, handle: p.handle ?? handle, deals: (deals as Deal[] | null) ?? [] };
}
