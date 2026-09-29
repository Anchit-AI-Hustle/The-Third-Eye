// web/lib/org.ts
// Server-side tenancy resolution. A user only ever sees orgs they're a member of: memberships
// are read by the session's user_id, and organizations only through those memberships. The
// active org is selected by a cookie set by the org switcher, defaulting to the first membership.
import "server-only";
import { cookies } from "next/headers";
import { getSessionUser, kolabDb } from "./db";
import type { PackType } from "./packs";

export const ACTIVE_ORG_COOKIE = "kolab_active_org";

export interface Organization {
  id: string;
  name: string;
  type: PackType;
  vertical: string | null;
  plan: string | null;
  status: string | null;
  seats: number;
}

export type MemberRole = "owner" | "admin" | "member" | "viewer";
export interface MembershipWithOrg {
  role: MemberRole;
  org: Organization;
}

export async function getMyMemberships(): Promise<MembershipWithOrg[]> {
  const user = await getSessionUser();
  if (!user) return [];
  const db = kolabDb();
  const { data: mems } = await db
    .from("memberships")
    .select("org_id, role")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });
  const rows = (mems as { org_id: string; role: MemberRole }[] | null) ?? [];
  if (!rows.length) return [];

  const { data: orgs } = await db
    .from("organizations")
    .select("id, name, type, vertical, plan, status, seats")
    .in("id", rows.map((r) => r.org_id));
  const byId = new Map(((orgs as Organization[] | null) ?? []).map((o) => [o.id, o]));
  return rows.flatMap((r) => {
    const org = byId.get(r.org_id);
    return org ? [{ role: r.role, org }] : [];
  });
}

/** The active org for this request: cookie-selected if valid, else the first membership. */
export async function getActiveOrg(): Promise<MembershipWithOrg | null> {
  const memberships = await getMyMemberships();
  if (memberships.length === 0) return null;
  const selected = (await cookies()).get(ACTIVE_ORG_COOKIE)?.value;
  return memberships.find((m) => m.org.id === selected) ?? memberships[0];
}
