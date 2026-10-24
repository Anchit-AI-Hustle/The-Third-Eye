import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { failure, findPurchase, paymentSignatureOk, settle } from "@/lib/razorpay";

export const runtime = "nodejs";

// Checkout's handler posts here when the payment completes in the page.
export async function POST(req: Request) {
  const email = (await getServerSession(authOptions))?.user?.email;
  if (!email) return Response.json({ error: "Not authenticated" }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const orderId = typeof b.razorpay_order_id === "string" ? b.razorpay_order_id : "";
  const paymentId = typeof b.razorpay_payment_id === "string" ? b.razorpay_payment_id : "";
  const signature = typeof b.razorpay_signature === "string" ? b.razorpay_signature : "";
  if (!orderId || !paymentId || !signature) return Response.json({ error: "The payment details are missing. No credits were added." }, { status: 400 });
  if (!paymentSignatureOk(orderId, paymentId, signature)) return Response.json({ error: "The payment could not be confirmed. No credits were added." }, { status: 400 });
  const purchase = await findPurchase(orderId);
  if (!purchase || purchase.user_id !== email) return Response.json({ error: "That payment is for a different order. No credits were added." }, { status: 400 });
  try {
    return Response.json({ ok: true, ...(await settle(purchase, paymentId)) });
  } catch (e) {
    return failure(e);
  }
}
