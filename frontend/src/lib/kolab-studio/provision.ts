// web/lib/provision.ts
// First-touch provisioning for a freshly authenticated user. Runs SERVER-SIDE with the
// service-role client so it can set `privileged` — which is derived from the server-only
// allow-list (CLAUDE.md guardrail #7) and must never be settable by the client.
//
// Idempotent: safe to call on every authed page load. Creates the profile / subscription /
// kyc rows if missing; it never downgrades or overwrites user-edited data.
import "server-only";
import type { User } from "@supabase/supabase-js";
import { supabaseAdmin } from "./supabaseServer";
import { isPrivilegedFromEnv } from "./privileged";

/** Extract the best-known phone for a user (phone auth sets user.phone; test/dev stores metadata). */
function phoneOf(user: User): string | null {
  return user.phone || (user.user_metadata?.phone as string | undefined) || null;
}

export async function ensureProvisioned(user: User): Promise<void> {
  const admin = supabaseAdmin();
  const { data: existing } = await admin
    .from("profiles")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (existing) return; // already provisioned

  const privileged = isPrivilegedFromEnv(phoneOf(user));

  await admin.from("profiles").insert({
    user_id: user.id,
    privileged,
    role: "creator",
    is_complete: false,
  });

  // Privileged accounts get complimentary Pro; everyone else starts with no active plan.
  await admin.from("subscriptions").insert(
    privileged
      ? { user_id: user.id, plan: "pro", cycle: "complimentary", status: "active" }
      : { user_id: user.id, plan: null, cycle: null, status: null },
  );

  await admin.from("kyc_verifications").insert({ user_id: user.id, status: "pending" });
}
