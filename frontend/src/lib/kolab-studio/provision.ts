// web/lib/provision.ts
// First-touch provisioning for a freshly authenticated user. Runs SERVER-SIDE so it can set
// `privileged` — which is derived from the server-only allow-list (CLAUDE.md guardrail #7) and
// must never be settable by the client.
//
// Idempotent: safe to call on every authed page load, and on two at once. Creates the
// profile / subscription / kyc rows if missing; it never downgrades or overwrites existing rows.
import "server-only";
import { kolabDb, type KolabUser } from "./db";
import { isPrivilegedFromEnv } from "./privileged";

export async function ensureProvisioned(user: KolabUser): Promise<void> {
  const db = kolabDb();
  const { data: existing } = await db
    .from("profiles")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (existing) return; // already provisioned

  // The id is the E.164 number under phone sign-in.
  const privileged = isPrivilegedFromEnv(user.id);
  const once = { onConflict: "user_id", ignoreDuplicates: true };

  await db.from("profiles").upsert({ user_id: user.id, privileged, role: "creator", is_complete: false }, once);

  // Privileged accounts get complimentary Pro; everyone else starts with no active plan.
  await db.from("subscriptions").upsert(
    privileged
      ? { user_id: user.id, plan: "pro", cycle: "complimentary", status: "active" }
      : { user_id: user.id, plan: null, cycle: null, status: null },
    once,
  );

  await db.from("kyc_verifications").upsert({ user_id: user.id, status: "pending" }, once);
}
