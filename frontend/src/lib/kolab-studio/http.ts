// web/lib/http.ts
// Small helpers for consistent JSON responses and safe error envelopes in route handlers.
import { NextResponse } from "next/server";
import { ZodError } from "zod";

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ ok: true, data }, { status: 200, ...init });
}

export function fail(message: string, status = 400, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, error: message, ...extra }, { status });
}

/** Never leak internals: map known errors to safe messages, everything else to a generic 500. */
export function handleError(e: unknown) {
  if (e instanceof ZodError) {
    return fail("Invalid input", 422, { issues: e.flatten().fieldErrors });
  }
  // Do not echo raw error text to clients in production (may contain PII/secrets).
  return fail("Something went wrong", 500);
}

/** Best-effort client IP for rate limiting / audit (behind Vercel/proxy). */
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "0.0.0.0";
}
