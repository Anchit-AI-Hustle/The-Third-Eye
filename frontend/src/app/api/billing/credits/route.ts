import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { creditBalance, creditsRefused, spendCredits, unlimitedCredits } from "@/lib/credits";

export const runtime = "nodejs";

// Creations rendered in the browser are charged here before they start.
const CLIENT_ACTIONS = new Set(["video.render"]);

async function user() {
  return (await getServerSession(authOptions))?.user?.email ?? null;
}

export async function GET() {
  const email = await user();
  if (!email) return Response.json({ error: "Not authenticated" }, { status: 401 });
  const unlimited = unlimitedCredits(email);
  const balance = unlimited ? null : await creditBalance(email);
  const db = getDb();
  if (!db) return Response.json({ unlimited, balance, used: 0, ledger: [] });
  // Creations made = spends minus refunds (the only credits added besides the gift).
  const [ledger, spent, refunded] = await Promise.all([
    db.from("credit_ledger").select("delta, reason, balance_after, created_at").eq("user_id", email).order("created_at", { ascending: false }).limit(50),
    db.from("credit_ledger").select("id", { count: "exact", head: true }).eq("user_id", email).lt("delta", 0),
    db.from("credit_ledger").select("id", { count: "exact", head: true }).eq("user_id", email).gt("delta", 0).neq("reason", "Sign-up gift"),
  ]);
  return Response.json({ unlimited, balance, used: (spent.count ?? 0) - (refunded.count ?? 0), ledger: ledger.data ?? [] });
}

export async function POST(req: Request) {
  const email = await user();
  if (!email) return Response.json({ error: "Not authenticated" }, { status: 401 });
  const { action } = (await req.json().catch(() => ({}))) as { action?: string };
  if (!action || !CLIENT_ACTIONS.has(action)) return Response.json({ error: "Unknown action" }, { status: 400 });
  const spend = await spendCredits(email, action);
  return spend.ok ? Response.json({ ok: true, cost: spend.cost, balance: spend.balance }) : creditsRefused(spend);
}
