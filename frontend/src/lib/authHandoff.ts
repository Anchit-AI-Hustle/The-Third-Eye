import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { Db } from "@/lib/db";
import { resolveAuthSecret } from "@/lib/authSecret";

// Sign-in handoff for apps that cannot keep a Google sign-in: an iPhone
// home-screen app finishes Google in Safari, whose cookies it does not share.
// The app makes a random code, opens /auth/handoff in Safari, the person signs
// in there and approves, and the app then claims the code for its own session
// cookie. Only a hash of the code is stored; a code is approved once, claimed
// once, and lives HANDOFF_TTL_MS.
//
// Anyone can start a browser handoff, so an approval alone must not sign a
// device in: someone could start one and send the link to a signed-in person.
// After approving, Safari shows a confirmation tied to that account, which is
// typed into the app on the same phone. One wrong confirmation burns the code.

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

// Browser-started codes live apart from the ones api/app-signin makes and
// approves itself, so they can only be claimed with a confirmation.
export const browserKey = (code: string) => `web:${code}`;

const CONFIRM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function confirmCode(code: string, email: string): string {
  const mac = createHmac("sha256", resolveAuthSecret()).update(`handoff\n${code}\n${email}`).digest();
  return Array.from(mac.subarray(0, 6), (b) => CONFIRM_ALPHABET[b % 32]).join("");
}

export async function claimBrowserHandoff(db: Db, code: string, typed: string): Promise<string | null> {
  const email = await claimHandoff(db, browserKey(code));
  if (!email) return null;
  const want = Buffer.from(confirmCode(code, email));
  const got = Buffer.from(typed.trim().toUpperCase());
  return got.length === want.length && timingSafeEqual(got, want) ? email : null;
}
