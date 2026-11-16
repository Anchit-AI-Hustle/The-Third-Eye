import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { creditBalance, creditsRefused, fallbackCreditLedger, spendCredits, unlimitedCredits } from "@/lib/credits";
import { CREDIT_COSTS, type Tier } from "@/lib/billing/plans";

export const runtime = "nodejs";

// Creations rendered in the browser (plus any defined credit action) are charged here before they start.
const CLIENT_ACTIONS = new Set(["video.render", ...Object.keys(CREDIT_COSTS)]);

function inferTierFromLedger(rows: { reason?: string }[]): Tier | null {
  for (const r of rows) {
    const reason = String(r.reason ?? "");
    const m = /(?:Test purchase|Purchase):\s*(Plus|Pro|Max)\s+plan/i.exec(reason);
    if (m) return m[1].toLowerCase() as Tier;
  }
  return null;
}

async function user() {
  return (await getServerSession(authOptions))?.user?.email ?? null;
}

export async function GET() {
  const email = await user();
  if (!email) return Response.json({ error: "Not authenticated" }, { status: 401 });
  const unlimited = unlimitedCredits(email);
  const balance = await creditBalance(email);
  const db = getDb();
  if (!db) {
    const fb = fallbackCreditLedger(email);
    return Response.json({ unlimited, balance, used: fb.used, ledger: fb.ledger, tier: inferTierFromLedger(fb.ledger) });
  }
  // Creations made = spends minus refunds (excluding sign-up gift and pack/plan top-ups).
  const [ledger, spent, positive] = await Promise.all([
    db.from("credit_ledger").select("delta, reason, balance_after, created_at").eq("user_id", email).order("created_at", { ascending: false }).limit(50),
    db.from("credit_ledger").select("id", { count: "exact", head: true }).eq("user_id", email).lt("delta", 0),
    db.from("credit_ledger").select("reason").eq("user_id", email).gt("delta", 0),
  ]);
  if (ledger.error) {
    const fb = fallbackCreditLedger(email);
    return Response.json({ unlimited, balance, used: fb.used, ledger: fb.ledger, tier: inferTierFromLedger(fb.ledger) });
  }
  const rows = ledger.data ?? [];
  const refundedCount = (positive.data ?? []).filter((r: { reason?: string }) => String(r.reason ?? "").startsWith("Refund:")).length;
  return Response.json({ unlimited, balance, used: Math.max(0, (spent.count ?? 0) - refundedCount), ledger: rows, tier: inferTierFromLedger(rows) });
}

export async function POST(req: Request) {
  const email = await user();
  if (!email) return Response.json({ error: "Not authenticated" }, { status: 401 });
  const { action } = (await req.json().catch(() => ({}))) as { action?: string };
  if (!action || !CLIENT_ACTIONS.has(action)) return Response.json({ error: "Unknown action" }, { status: 400 });
  const spend = await spendCredits(email, action);
  return spend.ok ? Response.json({ ok: true, cost: spend.cost, balance: spend.balance }) : creditsRefused(spend);
}
