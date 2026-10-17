import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { costOf, WELCOME_CREDITS } from "@/lib/billing/plans";

// Server-side credits, one wallet per account (supabase/migrations/*_credit_ledger.sql).
// A creation is charged before it runs and refunded when it fails. Accounts in
// OWNER_EMAILS are never charged.

export type Spend =
  | { ok: true; cost: number; balance: number | null }
  | { ok: false; cost: number; balance: number | null; error: string };

export function unlimitedCredits(email: string): boolean {
  return (process.env.OWNER_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean).includes(email.toLowerCase());
}

export async function creditBalance(email: string): Promise<number | null> {
  const db = getDb();
  if (!db) return null;
  const { data, error } = await db.rpc("credit_balance", { p_user_id: email, p_gift: WELCOME_CREDITS });
  return error ? null : Number(data);
}

export async function spendCredits(email: string, action: string): Promise<Spend> {
  const cost = costOf(action);
  if (unlimitedCredits(email)) return { ok: true, cost: 0, balance: null };
  const db = getDb();
  // Without a database there is no wallet to charge (local development).
  if (!db) return { ok: true, cost: 0, balance: null };
  const { data, error } = await db.rpc("spend_credits", { p_user_id: email, p_amount: cost, p_reason: action, p_gift: WELCOME_CREDITS });
  if (error) {
    console.error("spend_credits failed", error.code, error.message);
    return { ok: false, cost, balance: null, error: "Your credits could not be checked right now, so nothing was created. Try again in a minute." };
  }
  const balance = Number(data);
  if (balance < 0) {
    const have = await creditBalance(email);
    return { ok: false, cost, balance: have, error: `This needs ${cost} credits and you have ${have ?? 0}. Top up in Plans to keep creating.` };
  }
  return { ok: true, cost, balance };
}

export async function refundCredits(email: string, spend: Spend, action: string): Promise<void> {
  const db = getDb();
  if (!db || !spend.ok || !spend.cost) return;
  const { error } = await db.rpc("refund_credits", { p_user_id: email, p_amount: spend.cost, p_reason: `Refund: ${action} failed` });
  if (error) console.error("refund_credits failed", error.code, error.message);
}

export function creditsRefused(spend: Spend): Response {
  return Response.json(
    { error: spend.ok ? "" : spend.error, code: "insufficient_credits", cost: spend.cost, balance: spend.balance },
    { status: 402 },
  );
}

// Marks a 200 response as a failed creation, so chargedRoute gives the credits back.
export function refundable(res: Response): Response {
  res.headers.set("x-credits-refund", "1");
  return res;
}

// Wraps a creation route: charges `action` for a signed-in user before the
// handler runs, refunds when it returns an error (or a refundable() response).
export function chargedRoute<R extends Request>(action: string | ((req: Request) => Promise<string>), handler: (req: R) => Promise<Response>) {
  return async (req: R): Promise<Response> => {
    const email = (await getServerSession(authOptions))?.user?.email;
    if (!email) return handler(req);
    const name = typeof action === "string" ? action : await action(req.clone());
    const spend = await spendCredits(email, name);
    if (!spend.ok) return creditsRefused(spend);
    let res: Response;
    try {
      res = await handler(req);
    } catch (e) {
      await refundCredits(email, spend, name);
      throw e;
    }
    if (!res.ok || res.headers.get("x-credits-refund")) await refundCredits(email, spend, name);
    return res;
  };
}
