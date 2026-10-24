import { findPurchase, RazorpayError, settle, webhookSignatureOk } from "@/lib/razorpay";

export const runtime = "nodejs";

// Razorpay webhook (order.paid, payment.captured), signed over the raw body.
// The account's webhooks see every app's payments, so orders that are not ours
// get 200 and are left alone.
export async function POST(req: Request) {
  if (!process.env.RAZORPAY_WEBHOOK_SECRET) return new Response("Razorpay webhook not configured", { status: 501 });
  const raw = await req.text();
  if (!webhookSignatureOk(raw, req.headers.get("x-razorpay-signature"))) return new Response("Invalid signature", { status: 400 });
  const ev = JSON.parse(raw) as { event?: string; payload?: { payment?: { entity?: { id?: string; order_id?: string } } } };
  if (ev.event !== "order.paid" && ev.event !== "payment.captured") return Response.json({ ok: true, ignored: ev.event });
  const pay = ev.payload?.payment?.entity;
  const purchase = pay?.order_id ? await findPurchase(pay.order_id) : null;
  if (!purchase || !pay?.id) return Response.json({ ok: true, ignored: "not ours" });
  try {
    const { credited } = await settle(purchase, pay.id);
    return Response.json({ ok: true, credited });
  } catch (e) {
    if (e instanceof RazorpayError && e.status === 400) return Response.json({ ok: false, error: e.message });
    return new Response("Not settled", { status: 500 });
  }
}
