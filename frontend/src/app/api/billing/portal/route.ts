import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getStripe, appUrl } from "@/lib/stripe";
import { getAdminSupabase } from "@/lib/serverSupabase";

export const runtime = "nodejs";

export async function POST() {
  const stripe = getStripe();
  if (!stripe) return json({ error: "Billing not configured" }, 501);

  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) return json({ error: "Not authenticated" }, 401);

  const sb = getAdminSupabase();
  const { data } = sb
    ? await sb.from("profiles").select("stripe_customer_id").eq("user_id", email).maybeSingle()
    : { data: null };
  const customerId = data?.stripe_customer_id;
  if (!customerId) return json({ error: "No subscription found" }, 404);

  const portal = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${appUrl()}/settings`,
  });
  return json({ url: portal.url });
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
