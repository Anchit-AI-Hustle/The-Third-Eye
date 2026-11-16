import { createHmac, timingSafeEqual } from "node:crypto";
import { getDb } from "@/lib/db";
import { creditBalance } from "@/lib/credits";
import { BUNDLES, WELCOME_CREDITS } from "@/lib/billing/plans";

// Credit packs bought in India with Razorpay Standard Checkout (one-time orders,
// INR). Amounts come only from BUNDLES; credits are granted once per order and
// payment id by grant_razorpay_purchase (supabase/migrations/*_razorpay_purchases.sql).

const API = "https://api.razorpay.com/v1";
const ORDER_ID = /^order_[A-Za-z0-9]+$/;
const PAYMENT_ID = /^pay_[A-Za-z0-9]+$/;

export class RazorpayError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export interface Purchase {
  order_id: string;
  user_id: string;
  pack: string;
  credits: number;
  amount_paise: number;
  status: "created" | "paid";
  payment_id: string | null;
}

interface Payment { id: string; order_id: string; amount: number; currency: string; status: string }

export function razorpayReady(): boolean {
  return Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
}

// India (x-vercel-ip-country = IN) pays through Razorpay; with no country header
// (local development) it does too.
export function razorpayFor(country: string | null): boolean {
  return razorpayReady() && (!country || country.toUpperCase() === "IN");
}

async function call<T>(method: "GET" | "POST", path: string, body?: object): Promise<T> {
  const auth = Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString("base64");
  const r = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  }).catch(() => null);
  if (!r) throw new RazorpayError(502, "Razorpay could not be reached. Nothing was charged.");
  if (r.status === 401) {
    console.error("razorpay request refused", 401);
    throw new RazorpayError(500, "Payments are not available right now. Nothing was charged.");
  }
  const d = await r.json().catch(() => ({}));
  if (!r.ok) {
    console.error("razorpay request failed", r.status, d?.error?.code);
    throw new RazorpayError(502, "Razorpay could not take the request. Nothing was charged.");
  }
  return d as T;
}

function hmac(data: string, secret: string): string {
  return createHmac("sha256", secret).update(data).digest("hex");
}

function same(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length > 0 && x.length === y.length && timingSafeEqual(x, y);
}

export function paymentSignatureOk(orderId: string, paymentId: string, signature: string): boolean {
  return same(hmac(`${orderId}|${paymentId}`, process.env.RAZORPAY_KEY_SECRET ?? ""), signature);
}

export function webhookSignatureOk(raw: string, signature: string | null): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  return Boolean(secret && signature) && same(hmac(raw, secret!), signature!);
}

export function failure(e: unknown): Response {
  if (!(e instanceof RazorpayError)) throw e;
  return Response.json({ error: e.message }, { status: e.status });
}

export async function createOrder(user: string, packId: unknown) {
  const pack = BUNDLES.find((b) => b.id === packId);
  if (!pack) throw new RazorpayError(400, "Unknown pack.");
  const db = getDb();
  if (!db) throw new RazorpayError(501, "Purchases are not available here. Nothing was charged.");
  const credits = pack.credits + pack.bonus;
  const amount = pack.priceInr * 100;
  const order = await call<{ id: string }>("POST", "/orders", {
    amount,
    currency: "INR",
    receipt: `tte_${pack.id}_${Date.now().toString(36)}`,
    notes: { user, pack: pack.id, credits: String(credits) },
  });
  const { error } = await db.from("razorpay_purchases").insert({ order_id: order.id, user_id: user, pack: pack.id, credits, amount_paise: amount });
  if (error) {
    console.error("razorpay purchase not stored", error.code);
    throw new RazorpayError(500, "The checkout could not start. Nothing was charged.");
  }
  return {
    keyId: process.env.RAZORPAY_KEY_ID!,
    orderId: order.id,
    amount,
    currency: "INR",
    pack: { id: pack.id, label: pack.label, credits },
  };
}

export async function findPurchase(orderId: string): Promise<Purchase | null> {
  const db = getDb();
  if (!db || !ORDER_ID.test(orderId)) return null;
  const { data } = await db
    .from("razorpay_purchases")
    .select("order_id, user_id, pack, credits, amount_paise, status, payment_id")
    .eq("order_id", orderId)
    .maybeSingle();
  return data;
}

// Checks the payment with Razorpay (same order, same amount, captured — capturing
// it when only authorized), then credits the purchase once.
export async function settle(purchase: Purchase, paymentId: string): Promise<{ credited: boolean; balance: number | null }> {
  if (!PAYMENT_ID.test(paymentId)) throw new RazorpayError(400, "The payment could not be confirmed. No credits were added.");
  if (purchase.status === "paid") {
    if (purchase.payment_id !== paymentId) throw new RazorpayError(400, "That order was already paid with another payment.");
    return { credited: false, balance: await creditBalance(purchase.user_id) };
  }
  let pay = await call<Payment>("GET", `/payments/${paymentId}`);
  if (pay.order_id !== purchase.order_id) throw new RazorpayError(400, "That payment is for a different order. No credits were added.");
  if (pay.amount !== purchase.amount_paise || pay.currency !== "INR") throw new RazorpayError(400, "The amount paid does not match the pack. No credits were added.");
  if (pay.status === "authorized") pay = await call<Payment>("POST", `/payments/${paymentId}/capture`, { amount: purchase.amount_paise, currency: "INR" });
  if (pay.status !== "captured") throw new RazorpayError(400, "The payment has not gone through. No credits were added.");
  const label = BUNDLES.find((b) => b.id === purchase.pack)?.label ?? purchase.pack;
  const { data, error } = await getDb()!.rpc("grant_razorpay_purchase", {
    p_order_id: purchase.order_id,
    p_payment_id: paymentId,
    p_reason: `Bought ${label} pack (Razorpay)`,
    p_gift: WELCOME_CREDITS,
  });
  if (error) {
    console.error("grant_razorpay_purchase failed", error.code);
    throw new RazorpayError(500, "Your payment went through but the credits could not be added yet. They will be added shortly.");
  }
  const balance = Number(data);
  return balance >= 0 ? { credited: true, balance } : { credited: false, balance: await creditBalance(purchase.user_id) };
}
