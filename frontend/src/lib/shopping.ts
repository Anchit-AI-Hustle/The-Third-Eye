import { searchHits } from "@/lib/freeSearch";
import { getDb } from "@/lib/db";

// Shopping: find listings on real stores with keyless search, keep a cart per
// user, and hand back the store links so the user buys and pays on the store
// itself. JARVIS never pays. Prices come from the search listing, so they are
// labelled as listed prices to check on the store page.

export interface CartItem { title: string; url: string; price?: number; currency?: string; qty: number }
export interface Listing { title: string; url: string; store: string; price?: number; currency?: string; snippet: string }

export const DEFAULT_STORES = ["amazon.in", "flipkart.com"];
const CART_KEY = "shopping_cart";

export function listedPrice(text: string): { amount: number; currency: string } | null {
  const m = text.match(/(₹|Rs\.?|INR|\$|USD)\s?([\d,]+(?:\.\d{1,2})?)/i);
  if (!m) return null;
  const amount = Number(m[2].replace(/,/g, ""));
  return amount > 0 ? { amount, currency: /\$|usd/i.test(m[1]) ? "USD" : "INR" } : null;
}

const hostOf = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; } };

export async function productSearch(query: string, stores = DEFAULT_STORES): Promise<Listing[]> {
  const hits = await searchHits(`${query} ${stores.map((s) => `site:${s}`).join(" OR ")}`, query);
  return hits.flatMap((h) => {
    const host = hostOf(h.link);
    const store = stores.find((s) => host === s || host.endsWith(`.${s}`));
    if (!store) return [];
    const p = listedPrice(`${h.title} ${h.description}`);
    return [{ title: h.title, url: h.link, store, snippet: h.description, ...(p ? { price: p.amount, currency: p.currency } : {}) }];
  }).slice(0, 8);
}

export function cartAdd(cart: CartItem[], item: CartItem): CartItem[] {
  return cart.some((c) => c.url === item.url)
    ? cart.map((c) => (c.url === item.url ? { ...c, qty: c.qty + item.qty } : c))
    : [...cart, item];
}

/** `which` is a 1-based position or the item's link. */
export function cartRemove(cart: CartItem[], which: string): CartItem[] {
  const n = Number(which);
  return Number.isInteger(n) && n >= 1 ? cart.filter((_, i) => i !== n - 1) : cart.filter((c) => c.url !== which);
}

const money = (n: number, currency: string) => new Intl.NumberFormat(currency === "USD" ? "en-US" : "en-IN", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);

export function cartSummary(cart: CartItem[]): string {
  if (!cart.length) return "The cart is empty.";
  const lines = cart.map((c, i) => `${i + 1}. ${c.title} x${c.qty}${c.price ? ` - ${money(c.price * c.qty, c.currency ?? "INR")} listed` : " - no listed price"}\n   ${c.url}`);
  const totals = new Map<string, number>();
  for (const c of cart) if (c.price) totals.set(c.currency ?? "INR", (totals.get(c.currency ?? "INR") ?? 0) + c.price * c.qty);
  const unknown = cart.filter((c) => !c.price).length;
  const total = [...totals].map(([cur, n]) => money(n, cur)).join(" + ");
  return [
    ...lines,
    `Listed total: ${total || "unknown"}${unknown ? ` (${unknown} item${unknown > 1 ? "s have" : " has"} no listed price)` : ""}. Prices and stock are confirmed on the store at checkout.`,
  ].join("\n");
}

export async function loadCart(userId: string): Promise<CartItem[]> {
  const { data } = (await getDb()?.from("jarvis_memory").select("value").eq("user_id", userId).eq("key", CART_KEY).maybeSingle()) ?? {};
  try { return JSON.parse(data?.value ?? "[]"); } catch { return []; }
}

export async function saveCart(userId: string, cart: CartItem[]): Promise<boolean> {
  const db = getDb();
  if (!db) return false;
  const { error } = await db.from("jarvis_memory").upsert({ user_id: userId, key: CART_KEY, value: JSON.stringify(cart), updated_at: new Date().toISOString() }, { onConflict: "user_id,key" });
  return !error;
}
