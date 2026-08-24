// web/lib/org.ts
// Server-side tenancy resolution. All reads run under the user's RLS session; a user only ever
// sees orgs they're a member of (membership-keyed RLS in migration 0003). The active org is
// selected by a cookie set by the org switcher, defaulting to the first membership.
import "server-only";
import { cookies } from "next/headers";
import { supabaseServer } from "./supabaseServer";
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
  const supabase = await supabaseServer();
  const { data } = await supabase
    .from("memberships")
    .select("role, organizations(id, name, type, vertical, plan, status, seats)")
    .order("created_at", { ascending: true });

  const rows = (data as unknown as { role: MemberRole; organizations: Organization | null }[] | null) ?? [];
  return rows
    .filter((r) => r.organizations)
    .map((r) => ({ role: r.role, org: r.organizations as Organization }));
}

/** The active org for this request: cookie-selected if valid, else the first membership. */
export async function getActiveOrg(): Promise<MembershipWithOrg | null> {
  const memberships = await getMyMemberships();
  if (memberships.length === 0) return null;
  const selected = (await cookies()).get(ACTIVE_ORG_COOKIE)?.value;
  return memberships.find((m) => m.org.id === selected) ?? memberships[0];
}
