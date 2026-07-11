// Minimal Shopify Admin REST client for the data connector. Uses a stored
// custom-app Admin API access token (no OAuth dance). Pulls one page (<=250)
// per resource per run, filtered by updated_at_min for incremental sync.

const API_VERSION = "2024-10";

export interface ShopifyCreds {
  shop: string; // myshop.myshopify.com
  token: string; // Admin API access token (shpat_...)
}

export type ShopifyRow = Record<string, unknown>;

function normShop(shop: string): string {
  return shop.replace(/^https?:\/\//, "").replace(/\/+$/, "").trim();
}

/**
 * Fetch up to `limit` records of `resource` updated at/after `updatedMin`,
 * oldest-first so the cursor advances monotonically. Returns [] on error.
 */
export async function fetchResource(
  creds: ShopifyCreds,
  resource: "orders" | "customers" | "products",
  updatedMin: string | null,
  limit = 250,
): Promise<ShopifyRow[]> {
  const shop = normShop(creds.shop);
  const params = new URLSearchParams({ limit: String(limit), order: "updated_at asc" });
  if (resource === "orders") params.set("status", "any");
  if (updatedMin) params.set("updated_at_min", updatedMin);

  const res = await fetch(`https://${shop}/admin/api/${API_VERSION}/${resource}.json?${params.toString()}`, {
    headers: { "X-Shopify-Access-Token": creds.token, "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error(`shopify ${resource} ${res.status}`);
  const json = (await res.json()) as Record<string, ShopifyRow[]>;
  return json[resource] ?? [];
}

export async function shopInfo(creds: ShopifyCreds): Promise<{ name?: string; domain?: string } | null> {
  const shop = normShop(creds.shop);
  const res = await fetch(`https://${shop}/admin/api/${API_VERSION}/shop.json`, {
    headers: { "X-Shopify-Access-Token": creds.token },
  });
  if (!res.ok) return null;
  const j = (await res.json()) as { shop?: { name?: string; domain?: string } };
  return j.shop ?? null;
}

export function str(v: unknown): string | null {
  return typeof v === "string" ? v : v == null ? null : String(v);
}
export function num(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}
