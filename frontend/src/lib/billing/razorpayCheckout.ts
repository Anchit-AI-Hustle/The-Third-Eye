"use client";

// Razorpay Standard Checkout for credit packs (India, INR). Redirect mode,
// because phones block the bank page's popup: Razorpay posts the result to
// /api/billing/razorpay/callback, which sends the browser back to /plans#paid
// or #unpaid. The pack and user are kept in sessionStorage for that return.

const SCRIPT = "https://checkout.razorpay.com/v1/checkout.js";
const PENDING = "razorpay:pending";

interface Order { keyId: string; orderId: string; amount: number; currency: string; pack: { id: string; label: string; credits: number } }
interface Proof { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }
interface Checkout { open(): void; on(event: "payment.failed", fn: () => void): void }
export interface Pending { user: string | null; pack: string; label: string; credits: number }
export type Bought = { ok: true; balance: number | null } | { ok: false; message: string };

declare global {
  interface Window { Razorpay?: new (options: object) => Checkout }
}

function loadScript(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SCRIPT;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("checkout.js did not load"));
    document.head.appendChild(s);
  });
}

export async function buyPack(pack: string, user: string | null): Promise<Bought> {
  const r = await fetch("/api/billing/razorpay/order", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pack }),
  }).catch(() => null);
  const order = (r ? await r.json().catch(() => ({})) : {}) as Order & { error?: string };
  if (!r?.ok) return { ok: false, message: order.error ?? "The checkout could not start. Nothing was charged." };
  try {
    await loadScript();
  } catch {
    return { ok: false, message: "Razorpay's checkout could not load. Nothing was charged." };
  }
  const pending: Pending = { user, pack: order.pack.id, label: order.pack.label, credits: order.pack.credits };
  sessionStorage.setItem(PENDING, JSON.stringify(pending));

  return new Promise((resolve) => {
    const checkout = new window.Razorpay!({
      key: order.keyId,
      order_id: order.orderId,
      amount: order.amount,
      currency: order.currency,
      name: "The Third Eye",
      description: `${order.pack.label} pack: ${order.pack.credits.toLocaleString()} credits`,
      prefill: user?.startsWith("+") ? { contact: user } : user?.includes("@") ? { email: user } : {},
      theme: { color: "#4FC3F7" },
      redirect: true,
      callback_url: `${location.origin}/api/billing/razorpay/callback`,
      handler: async (proof: Proof) => {
        const v = await fetch("/api/billing/razorpay/verify", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(proof),
        }).catch(() => null);
        const d = v ? await v.json().catch(() => ({})) : {};
        sessionStorage.removeItem(PENDING);
        resolve(v?.ok ? { ok: true, balance: d.balance ?? null } : { ok: false, message: d.error ?? "The payment could not be confirmed. If you were charged, the credits will be added shortly." });
      },
      modal: { ondismiss: () => { sessionStorage.removeItem(PENDING); resolve({ ok: false, message: "Checkout closed. Nothing was charged." }); } },
    });
    checkout.on("payment.failed", () => resolve({ ok: false, message: "The payment did not go through. Nothing was charged." }));
    checkout.open();
  });
}

// After the redirect back: #paid or #unpaid, with what was being bought.
export function takeReturn(): { paid: boolean; pending: Pending | null } | null {
  const hash = location.hash;
  if (hash !== "#paid" && hash !== "#unpaid") return null;
  let pending: Pending | null = null;
  try { pending = JSON.parse(sessionStorage.getItem(PENDING) ?? "null"); } catch { /* unreadable: show the plain message */ }
  sessionStorage.removeItem(PENDING);
  history.replaceState(null, "", location.pathname + location.search);
  return { paid: hash === "#paid", pending };
}
