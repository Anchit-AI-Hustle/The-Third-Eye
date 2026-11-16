import { getServerSession } from "next-auth";
import type { NextRequest } from "next/server";
import type Stripe from "stripe";
import { authOptions } from "@/lib/auth";
import { getStripe, appUrl, PRICES } from "@/lib/stripe";
import { getDb } from "@/lib/db";
import { isEmailIdentity } from "@/lib/serverIdentity";
import { BUNDLES, PERIODS, priceFor, TIERS, type BillingPeriod, type Tier } from "@/lib/billing/plans";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const stripe = getStripe();
  if (!stripe) return json({ error: "Billing not configured" }, 501);

  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) return json({ error: "Not authenticated" }, 401);

  const body = (await req.json().catch(() => ({}))) as {
    interval?: "monthly" | "yearly";
    tier?: Tier;
    period?: BillingPeriod;
    bundle?: string;
  };

  // Reuse an existing Stripe customer if we've seen this user before.
  const sb = getDb();
  let customerId: string | undefined;
  if (sb && typeof sb.from === "function") {
    const { data } = await sb.from("profiles").select("stripe_customer_id").eq("user_id", email).maybeSingle();
    customerId = data?.stripe_customer_id ?? undefined;
  }

  const customerField = customerId
    ? { customer: customerId }
    : isEmailIdentity(email)
      ? { customer_email: email }
      : {};

  // One-time credit pack purchase
  if (body.bundle) {
    const pack = BUNDLES.find((b) => b.id === body.bundle);
    if (!pack) return json({ error: "Unknown credit pack" }, 400);
    const totalCredits = pack.credits + pack.bonus;
    const checkout = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "inr",
            unit_amount: pack.priceInr * 100,
            product_data: {
              name: `The Third Eye · ${pack.label} Credit Pack (${totalCredits.toLocaleString()} credits)`,
            },
          },
        },
      ],
      ...customerField,
      client_reference_id: email,
      metadata: { email, bundle: pack.id, credits: String(totalCredits) },
      success_url: `${appUrl()}/plans?upgraded=1`,
      cancel_url: `${appUrl()}/plans?canceled=1`,
      allow_promotion_codes: true,
    });
    return json({ url: checkout.url });
  }

  // Subscription checkout: use configured price ID if present, or inline price_data for tier/period
  const configuredPrice = body.interval === "yearly" ? PRICES.yearly : PRICES.monthly;
  const tierId: Tier = body.tier && body.tier !== "basic" && body.tier in TIERS ? body.tier : "pro";
  const periodId: BillingPeriod = body.period && PERIODS.some((p) => p.id === body.period) ? body.period : body.interval === "yearly" ? "annual" : "monthly";
  const plan = TIERS[tierId];
  const priceInr = priceFor(tierId, periodId);

  if (!configuredPrice && priceInr <= 0) return json({ error: "Price not configured" }, 501);

  const recurringInterval: Stripe.Checkout.SessionCreateParams.LineItem.PriceData.Recurring =
    periodId === "daily"
      ? { interval: "day", interval_count: 1 }
      : periodId === "weekly"
        ? { interval: "week", interval_count: 1 }
        : periodId === "quarterly"
          ? { interval: "month", interval_count: 3 }
          : periodId === "annual"
            ? { interval: "year", interval_count: 1 }
            : { interval: "month", interval_count: 1 };

  const lineItem: Stripe.Checkout.SessionCreateParams.LineItem = configuredPrice
    ? { price: configuredPrice, quantity: 1 }
    : {
        quantity: 1,
        price_data: {
          currency: "inr",
          unit_amount: priceInr * 100,
          recurring: recurringInterval,
          product_data: {
            name: `The Third Eye · ${plan.label} Plan (${plan.monthlyCredits.toLocaleString()} credits/mo)`,
          },
        },
      };

  const checkout = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [lineItem],
    ...customerField,
    client_reference_id: email,
    metadata: { email, tier: tierId, period: periodId, credits: String(plan.monthlyCredits) },
    subscription_data: { metadata: { email, tier: tierId, period: periodId } },
    success_url: `${appUrl()}/plans?upgraded=1`,
    cancel_url: `${appUrl()}/plans?canceled=1`,
    allow_promotion_codes: true,
  });

  return json({ url: checkout.url });
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
