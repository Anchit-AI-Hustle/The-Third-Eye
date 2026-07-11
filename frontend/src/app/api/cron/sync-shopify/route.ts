import type { NextRequest } from "next/server";
import { getAdminSupabase } from "@/lib/serverSupabase";
import { cronAuthorized, type Sb } from "@/lib/cron";
import { getCredentials, usersWithProvider, getCursor, setCursor } from "@/lib/integrations";
import { fetchResource, str, num, type ShopifyCreds, type ShopifyRow } from "@/lib/shopify";
import { logActivity } from "@/lib/activity";

export const runtime = "nodejs";
export const maxDuration = 60;

// Vercel Cron: pull each connected user's recent Shopify data into your own
// Supabase (raw landing tables), incrementally by updated_at.
export async function GET(req: NextRequest) {
  if (!cronAuthorized(req)) return new Response("Unauthorized", { status: 401 });
  const sb = getAdminSupabase();
  if (!sb) return Response.json({ error: "Supabase not configured" }, { status: 501 });

  const users = await usersWithProvider("shopify");
  const summary: Record<string, unknown> = {};
  for (const email of users) {
    try {
      summary[email] = await syncUser(sb, email);
    } catch (e) {
      summary[email] = { error: e instanceof Error ? e.message : String(e) };
    }
  }
  return Response.json({ users: users.length, summary });
}

function maxUpdatedAt(rows: ShopifyRow[]): string | null {
  let max: string | null = null;
  for (const r of rows) {
    const u = str(r.updated_at);
    if (u && (!max || u > max)) max = u;
  }
  return max;
}

function mapRow(email: string, resource: string, r: ShopifyRow): Record<string, unknown> {
  const base = {
    user_id: email,
    id: String(r.id),
    created_at: str(r.created_at),
    updated_at: str(r.updated_at),
    raw: r,
  };
  if (resource === "orders") {
    return {
      ...base,
      order_number: num(r.order_number),
      email: str(r.email),
      total_price: num(r.total_price),
      currency: str(r.currency),
      financial_status: str(r.financial_status),
      fulfillment_status: str(r.fulfillment_status),
    };
  }
  if (resource === "customers") {
    return {
      ...base,
      email: str(r.email),
      first_name: str(r.first_name),
      last_name: str(r.last_name),
      orders_count: num(r.orders_count),
      total_spent: num(r.total_spent),
    };
  }
  return {
    ...base,
    title: str(r.title),
    status: str(r.status),
    vendor: str(r.vendor),
    product_type: str(r.product_type),
  };
}

const RESOURCES = [
  { resource: "orders", table: "shopify_orders" },
  { resource: "customers", table: "shopify_customers" },
  { resource: "products", table: "shopify_products" },
] as const;

async function syncUser(sb: Sb, email: string) {
  const creds = await getCredentials<ShopifyCreds>(email, "shopify");
  if (!creds) return { skipped: "shopify not connected" };

  const counts: Record<string, number> = {};
  for (const { resource, table } of RESOURCES) {
    const cursor = await getCursor(email, "shopify", resource);
    const rows = await fetchResource(creds.credentials, resource, cursor);
    if (rows.length) {
      const mapped = rows.map((r) => mapRow(email, resource, r));
      await sb.from(table).upsert(mapped, { onConflict: "user_id,id" });
      const newMax = maxUpdatedAt(rows);
      if (newMax) await setCursor(email, "shopify", resource, newMax);
    }
    counts[resource] = rows.length;
  }

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (total) {
    await logActivity(email, "sync", "Shopify sync", {
      detail: `orders ${counts.orders}, customers ${counts.customers}, products ${counts.products}`,
      context: counts,
    });
  }
  return counts;
}
