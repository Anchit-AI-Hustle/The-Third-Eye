import type { NextRequest } from "next/server";

// Shared gate for automation endpoints that cost money (LLM calls) or take
// action (posting). Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`.
// If CRON_SECRET is unset we allow requests (local dev); always set it in prod.
export function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${secret}` || req.headers.get("x-cron-secret") === secret;
}
