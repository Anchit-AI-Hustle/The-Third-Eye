import { createHash } from "node:crypto";
import type { Db } from "@/lib/db";

// Sign-in handoff for apps that cannot keep a Google sign-in: an iPhone
// home-screen app finishes Google in Safari, whose cookies it does not share.
// The app makes a random code, opens /auth/handoff in Safari, the person signs
// in there and approves, and the app then claims the code for its own session
// cookie. Only a hash of the code is stored; a code is approved once, claimed
// once, and lives HANDOFF_TTL_MS.

export const HANDOFF_TTL_MS = 10 * 60_000;

export function validCode(code: unknown): code is string {
  return typeof code === "string" && /^[0-9a-f]{64}$/.test(code);
}

export function codeHash(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

const fresh = () => new Date(Date.now() - HANDOFF_TTL_MS).toISOString();

export async function startHandoff(db: Db, code: string): Promise<void> {
  await db.from("auth_handoffs").insert({ id: codeHash(code), created_at: new Date().toISOString() });
}

export async function approveHandoff(db: Db, code: string, email: string): Promise<boolean> {
  const { data } = await db.from("auth_handoffs").update({ email, approved_at: new Date().toISOString() })
    .eq("id", codeHash(code)).is("email", null).gt("created_at", fresh()).select("id");
  return Array.isArray(data) && data.length > 0;
}

export async function claimHandoff(db: Db, code: string): Promise<string | null> {
  const { data } = await db.from("auth_handoffs").update({ claimed_at: new Date().toISOString() })
    .eq("id", codeHash(code)).not("email", "is", null).is("claimed_at", null).gt("created_at", fresh()).select("email");
  const row = Array.isArray(data) ? (data[0] as { email?: string } | undefined) : undefined;
  return row?.email ?? null;
}
