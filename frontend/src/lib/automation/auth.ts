import type { NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";

// Shared gate for automation endpoints that cost money (LLM calls) or take
// action (posting). Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`.
// Without CRON_SECRET it is open only in local development.
export function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  const got = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  return got.length === want.length && timingSafeEqual(got, want);
}
