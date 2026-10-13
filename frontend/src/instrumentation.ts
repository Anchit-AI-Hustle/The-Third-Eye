import { checkEnv } from "@/lib/env";

export function register() {
  // Edge middleware has no use for these vars, and `next build` runs without runtime secrets.
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NEXT_PHASE === "phase-production-build") return;
  checkEnv(process.env, { production: process.env.NODE_ENV === "production" });
}
