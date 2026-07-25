// Single source of truth for the NextAuth secret.
//
// In production we FAIL CLOSED: if NEXTAUTH_SECRET is unset, throw rather than
// silently fall back to a hard-coded string. A shared/known secret lets anyone
// forge session JWTs, so booting without a real secret in prod is never safe.
// In development we allow a stable dev-only fallback so local runs don't need
// the env var configured.
const DEV_FALLBACK = "dev-only-insecure-secret-set-NEXTAUTH_SECRET-in-prod";

export function resolveAuthSecret(): string {
  const secret = process.env.NEXTAUTH_SECRET;
  if (secret) return secret;
  // Skip the hard failure during `next build` page-data collection: no real
  // requests are served then, and build env often omits runtime secrets.
  const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";
  if (process.env.NODE_ENV === "production" && !isBuildPhase) {
    throw new Error(
      "NEXTAUTH_SECRET is not set. Refusing to start with an insecure fallback " +
        "secret in production — set NEXTAUTH_SECRET in the environment.",
    );
  }
  return DEV_FALLBACK;
}
