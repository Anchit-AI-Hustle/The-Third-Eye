import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { grantCredits, unlimitedCredits } from "@/lib/credits";
import { BUNDLES, TIERS, type Tier } from "@/lib/billing/plans";

export const runtime = "nodejs";

// Owner test accounts (OWNER_EMAILS) can buy any pack or plan without paying,
// to test the purchase flow end to end. Everyone else gets 403 until a real
// payment gateway is connected.
export async function POST(req: Request) {
  const email = (await getServerSession(authOptions))?.user?.email;
  if (!email) return Response.json({ error: "Not authenticated" }, { status: 401 });
  if (!unlimitedCredits(email)) return Response.json({ error: "Payments are not live yet. Nothing was charged and no credits were added." }, { status: 403 });
  const { bundle, tier } = (await req.json().catch(() => ({}))) as { bundle?: string; tier?: string };
  const pack = BUNDLES.find((b) => b.id === bundle);
  const plan = tier && tier !== "basic" && tier in TIERS ? TIERS[tier as Tier] : null;
  if (!pack && !plan) return Response.json({ error: "Unknown pack or plan" }, { status: 400 });
  const amount = pack ? pack.credits + pack.bonus : plan!.monthlyCredits;
  const label = pack ? `${pack.label} pack` : `${plan!.label} plan`;
  const balance = await grantCredits(email, amount, `Test purchase: ${label} (no payment)`);
  if (balance === null) return Response.json({ error: "The credits could not be added. Try again." }, { status: 500 });
  return Response.json({ ok: true, added: amount, balance });
}
