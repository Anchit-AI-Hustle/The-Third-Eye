import { getServerSession } from "next-auth";
import type { NextRequest } from "next/server";
import { authOptions } from "@/lib/auth";
import { getStripe, appUrl, PRICES } from "@/lib/stripe";
import { getAdminSupabase } from "@/lib/serverSupabase";
import { isEmailIdentity } from "@/lib/serverIdentity";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const stripe = getStripe();
  if (!stripe) return json({ error: "Billing not configured" }, 501);

  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) return json({ error: "Not authenticated" }, 401);

  const { interval } = (await req.json().catch(() => ({}))) as { interval?: "monthly" | "yearly" };
  const price = interval === "yearly" ? PRICES.yearly : PRICES.monthly;
  if (!price) return json({ error: "Price not configured" }, 501);

  // Reuse an existing Stripe customer if we've seen this user before.
  const sb = getAdminSupabase();
  let customerId: string | undefined;
  if (sb) {
    const { data } = await sb.from("profiles").select("stripe_customer_id").eq("user_id", email).maybeSingle();
    customerId = data?.stripe_customer_id ?? undefined;
  }

  const checkout = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price, quantity: 1 }],
    // Prefill the email only when the identity IS one. Under phone sign-in it is
    // an E.164 number, and Stripe rejects that as customer_email — which would
    // have meant nobody signing in by number could ever subscribe. Left unset,
    // Stripe Checkout asks for the address on its own page, which is where a
    // billing email belongs anyway.
    ...(customerId
      ? { customer: customerId }
      : isEmailIdentity(email)
        ? { customer_email: email }
        : {}),
    client_reference_id: email,
    metadata: { email },
    subscription_data: { metadata: { email } },
    success_url: `${appUrl()}/settings?upgraded=1`,
    cancel_url: `${appUrl()}/settings?canceled=1`,
    allow_promotion_codes: true,
  });

  return json({ url: checkout.url });
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
