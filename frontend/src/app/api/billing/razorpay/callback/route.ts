import { findPurchase, paymentSignatureOk, RazorpayError, settle } from "@/lib/razorpay";

export const runtime = "nodejs";

// Redirect mode: Razorpay posts the payment form (or error[...] fields) here
// and the browser follows the 303 back to Plans. The session cookie is not sent
// on this cross-site POST, so the purchase row says whose credits these are.
export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  const field = (k: string) => String(form?.get(k) ?? "");
  const back = (paid: boolean) => new Response(null, { status: 303, headers: { Location: new URL(`/plans#${paid ? "paid" : "unpaid"}`, req.url).toString() } });
  const orderId = field("razorpay_order_id");
  const paymentId = field("razorpay_payment_id");
  if (!paymentSignatureOk(orderId, paymentId, field("razorpay_signature"))) return back(false);
  const purchase = await findPurchase(orderId);
  if (!purchase) return back(false);
  try {
    await settle(purchase, paymentId);
    return back(true);
  } catch (e) {
    if (!(e instanceof RazorpayError)) console.error("razorpay callback failed");
    return back(false);
  }
}
