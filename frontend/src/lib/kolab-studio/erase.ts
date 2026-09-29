// Erasure of one user's Kolab Studio data, for /api/account/delete. Kolab rows are keyed by the
// same identity as the rest of the app, so deleting the account has to reach them too.
import "server-only";
import type { Db } from "@/lib/db";

const MISSING = new Set(["42P01", "3F000"]); // no such table / schema: nothing stored

const OWN_ROWS = [
  "content_plan", "scheduled_posts", "deals", "content_pillars", "channels", "consents",
  "kyc_verifications", "subscriptions", "profiles", "memberships",
];

/** Returns the Kolab tables that could not be cleared; empty when everything went. */
export async function eraseKolabUser(db: Db, id: string): Promise<string[]> {
  const k = db.schema("kolab");
  const failed: string[] = [];
  const check = (table: string, error: { code: string } | null) => {
    if (error && !MISSING.has(error.code)) failed.push(`kolab.${table}`);
  };

  for (const t of OWN_ROWS) check(t, (await k.from(t).delete().eq("user_id", id)).error);

  // Orgs this user created: gone if nobody else is left in them, otherwise kept for the
  // remaining members with the creator's identity removed.
  const { data: created, error: orgErr } = await k.from("organizations").select("id").eq("created_by", id);
  check("organizations", orgErr);
  for (const { id: orgId } of (created as { id: string }[] | null) ?? []) {
    const { count, error } = await k.from("memberships").select("id", { count: "exact", head: true }).eq("org_id", orgId);
    check("memberships", error);
    if (error) continue;
    const res = count
      ? await k.from("organizations").update({ created_by: null }).eq("id", orgId)
      : await k.from("organizations").delete().eq("id", orgId);
    check("organizations", res.error);
  }

  check("org_invites", (await k.from("org_invites").delete().eq("email", id)).error);
  check("org_invites", (await k.from("org_invites").update({ invited_by: null }).eq("invited_by", id)).error);
  // audit_log is append-only everywhere else; erasure on request is the one exception,
  // as it is for the app's own agent_audit.
  check("audit_log", (await k.from("audit_log").delete().eq("actor_id", id)).error);

  return [...new Set(failed)];
}
