import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { costOf, WELCOME_CREDITS } from "@/lib/billing/plans";
import { isUserTestUnlocked } from "@/lib/testUnlock";
import { withOwnKeys } from "@/lib/providerKeys";

// Server-side credits, one wallet per account (supabase/migrations/*_credit_ledger.sql).
// A creation is charged before it runs and refunded when it fails. Accounts in
// OWNER_EMAILS (or test-unlocked accounts) are never charged.

export type Spend =
  | { ok: true; cost: number; balance: number | null }
  | { ok: false; cost: number; balance: number | null; error: string };

export interface CreditLedgerRow {
  delta: number;
  reason: string;
  balance_after: number;
  created_at: string;
}

const memWallets = new Map<string, number>();
const memLedgers = new Map<string, CreditLedgerRow[]>();

function memEnsure(email: string): number {
  const key = email.toLowerCase();
  if (!memWallets.has(key)) {
    memWallets.set(key, WELCOME_CREDITS);
    memLedgers.set(key, [
      { delta: WELCOME_CREDITS, reason: "Sign-up gift", balance_after: WELCOME_CREDITS, created_at: new Date().toISOString() },
    ]);
  }
  return memWallets.get(key)!;
}

function memMutate(email: string, delta: number, reason: string): number {
  const key = email.toLowerCase();
  const current = memEnsure(key);
  const next = current + delta;
  if (next < 0) return -1;
  memWallets.set(key, next);
  const list = memLedgers.get(key) ?? [];
  list.unshift({ delta, reason, balance_after: next, created_at: new Date().toISOString() });
  memLedgers.set(key, list.slice(0, 100));
  return next;
}

export function fallbackCreditLedger(email: string): { used: number; ledger: CreditLedgerRow[] } {
  const key = email.toLowerCase();
  memEnsure(key);
  const ledger = memLedgers.get(key) ?? [];
  const spent = ledger.filter((r) => r.delta < 0).length;
  const refunded = ledger.filter((r) => r.delta > 0 && r.reason.startsWith("Refund:")).length;
  return { used: Math.max(0, spent - refunded), ledger: ledger.slice(0, 50) };
}

export function unlimitedCredits(email: string): boolean {
  if (isUserTestUnlocked(email)) return true;
  return (process.env.OWNER_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean).includes(email.toLowerCase());
}

export async function creditBalance(email: string): Promise<number | null> {
  const db = getDb();
  if (!db) return memEnsure(email);
  const { data, error } = await db.rpc("credit_balance", { p_user_id: email, p_gift: WELCOME_CREDITS });
  return error ? memEnsure(email) : Number(data);
}

export async function spendCredits(email: string, action: string): Promise<Spend> {
  const cost = costOf(action);
  if (unlimitedCredits(email)) return { ok: true, cost: 0, balance: null };
  const db = getDb();
  // Without a database there is no persistent wallet to charge (local development).
  if (!db) return { ok: true, cost: 0, balance: null };
  const { data, error } = await db.rpc("spend_credits", { p_user_id: email, p_amount: cost, p_reason: action, p_gift: WELCOME_CREDITS });
  const balance = error ? memMutate(email, -cost, action) : Number(data);
  if (error) {
    console.warn("spend_credits RPC unavailable, using in-memory wallet fallback:", error.code, error.message);
  }
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
  if (error) {
    memMutate(email, spend.cost, `Refund: ${action} failed`);
  }
}

/**
 * Idempotent refund for an async paid job that failed after POST charged.
 * Reason is keyed by action + job id so repeated polls do not over-credit.
 * Prefers refund_credits_once (atomic); falls back to check-then-refund.
 */
export async function refundJobOnce(email: string, action: string, jobId: string): Promise<boolean> {
  if (!jobId || !action || unlimitedCredits(email)) return false;
  const cost = costOf(action);
  if (!cost) return false;
  const db = getDb();
  if (!db) return false;
  const reason = `Refund: ${action} job ${jobId}`;
  const once = await db.rpc("refund_credits_once", { p_user_id: email, p_amount: cost, p_reason: reason });
  if (!once.error) {
    const code = Number(once.data);
    return Number.isFinite(code) && code >= 0;
  }
  // RPC missing (migration not applied yet): best-effort check-then-refund.
  const { data: existing } = await db.from("credit_ledger").select("id").eq("user_id", email).eq("reason", reason).limit(1);
  if (existing?.length) return false;
  const { error } = await db.rpc("refund_credits", { p_user_id: email, p_amount: cost, p_reason: reason });
  if (error) {
    console.error("refundJobOnce failed", error.code, error.message);
    return false;
  }
  return true;
}

export function refundMusicJobOnce(email: string, jobId: string): Promise<boolean> {
  return refundJobOnce(email, "music.generate", jobId);
}

// Adds credits (a test purchase on an owner account). refund_credits adds to
// the balance and writes the ledger row; credit_balance opens the wallet first.
export async function grantCredits(email: string, amount: number, reason: string): Promise<number | null> {
  const db = getDb();
  if (!db) return memMutate(email, amount, reason);
  await creditBalance(email);
  const { data, error } = await db.rpc("refund_credits", { p_user_id: email, p_amount: amount, p_reason: reason });
  return error ? memMutate(email, amount, reason) : Number(data);
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
      res = await withOwnKeys(email, () => handler(req));
    } catch (e) {
      await refundCredits(email, spend, name);
      throw e;
    }
    if (!res.ok || res.headers.get("x-credits-refund")) await refundCredits(email, spend, name);
    return res;
  };
}
