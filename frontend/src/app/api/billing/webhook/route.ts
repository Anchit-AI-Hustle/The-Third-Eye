import type { NextRequest } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { getAdminSupabase } from "@/lib/serverSupabase";

export const runtime = "nodejs";

// Stripe requires the raw request body for signature verification.
export async function POST(req: NextRequest) {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) return new Response("Billing not configured", { status: 501 });

  const sig = req.headers.get("stripe-signature");
  if (!sig) return new Response("Missing signature", { status: 400 });

  const raw = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(raw, sig, secret);
  } catch (err) {
    return new Response(`Invalid signature: ${err instanceof Error ? err.message : ""}`, { status: 400 });
  }

  const sb = getAdminSupabase();
  if (!sb) return new Response("Supabase not configured", { status: 501 });

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const s = event.data.object as Stripe.Checkout.Session;
        const email = s.metadata?.email || s.client_reference_id || (s.customer_email ?? undefined);
        if (email) {
          await upsert(sb, email, {
            stripe_customer_id: typeof s.customer === "string" ? s.customer : undefined,
            stripe_subscription_id: typeof s.subscription === "string" ? s.subscription : undefined,
            subscription_tier: "premium",
            subscription_status: "active",
          });
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const email = sub.metadata?.email || (await emailForCustomer(stripe, sub.customer));
        if (email) {
          const active = sub.status === "active" || sub.status === "trialing";
          await upsert(sb, email, {
            stripe_customer_id: typeof sub.customer === "string" ? sub.customer : undefined,
            stripe_subscription_id: sub.id,
            subscription_tier: active ? "premium" : "free",
            subscription_status: sub.status,
            current_period_end: periodEnd(sub),
          });
        }
        break;
      }
    }
  } catch (err) {
    return new Response(`Handler error: ${err instanceof Error ? err.message : ""}`, { status: 500 });
  }

  return new Response("ok", { status: 200 });
}

// Stripe moved current_period_end onto subscription items in newer API versions.
function periodEnd(sub: Stripe.Subscription): string | undefined {
  const top = (sub as any).current_period_end;
  const item = (sub as any).items?.data?.[0]?.current_period_end;
  const epoch = top ?? item;
  return typeof epoch === "number" ? new Date(epoch * 1000).toISOString() : undefined;
}

async function emailForCustomer(stripe: Stripe, customer: string | Stripe.Customer | Stripe.DeletedCustomer): Promise<string | undefined> {
  const id = typeof customer === "string" ? customer : customer.id;
  try {
    const c = await stripe.customers.retrieve(id);
    return !("deleted" in c) ? (c.email ?? undefined) : undefined;
  } catch {
    return undefined;
  }
}

async function upsert(sb: NonNullable<ReturnType<typeof getAdminSupabase>>, email: string, patch: Record<string, unknown>) {
  const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
  await sb.from("profiles").upsert(
    { user_id: email, updated_at: new Date().toISOString(), ...clean },
    { onConflict: "user_id" },
  );
}
