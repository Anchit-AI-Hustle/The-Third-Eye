import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { createOrder, failure, razorpayReady } from "@/lib/razorpay";

export const runtime = "nodejs";

// Starts a Razorpay order for a credit pack. Only the pack id is read from the
// body; the amount comes from the catalog.
export async function POST(req: Request) {
  const email = (await getServerSession(authOptions))?.user?.email;
  if (!email) return Response.json({ error: "Not authenticated" }, { status: 401 });
  if (!razorpayReady()) return Response.json({ error: "Razorpay is not set up. Nothing was charged." }, { status: 501 });
  const { pack } = (await req.json().catch(() => ({}))) as { pack?: unknown };
  try {
    return Response.json(await createOrder(email, pack));
  } catch (e) {
    return failure(e);
  }
}
