"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";

// NextAuth redirects here with ?error=<code>. Map each code to something the
// operator can act on, and always surface the raw code — a generic "an error
// occurred" hides whether the problem is missing server env or a bad PIN.
//
// The OAuth codes (OAuthSignin, OAuthCallback, OAuthAccountNotLinked,
// AccessDenied for a Google consent screen) went when Google stopped being a
// sign-in provider — see lib/auth.ts. Sign-in is now a mobile number and a
// 4-digit PIN, and the form shows a wrong PIN or a locked account inline, so
// almost nothing should ever land here.
const ERRORS: Record<string, { title: string; detail: string }> = {
  Configuration: {
    title: "Server isn't configured for sign-in",
    detail:
      "Sign-in needs NEXTAUTH_SECRET and NEXTAUTH_URL, and DATABASE_URL (Neon Postgres) to keep accounts in. Set them in the deployment environment.",
  },
  CredentialsSignin: {
    title: "That number and PIN didn’t match",
    detail:
      "Check the number, then the PIN. Five wrong PINs lock the account for fifteen minutes; after that, try again.",
  },
  SessionRequired: {
    title: "Please sign in to see that page",
    detail: "Your session has expired, or you were never signed in on this device.",
  },
  Default: {
    title: "Authentication error",
    detail: "Something went wrong signing you in. Try again, and if it persists check the server logs.",
  },
};

function AuthErrorContent() {
  const code = useSearchParams().get("error") || "Default";
  const e = ERRORS[code] ?? ERRORS.Default;
  return (
    <>
      <h1 className="font-display text-xl font-semibold text-text-primary mb-2">{e.title}</h1>
      <p className="text-text-secondary text-sm mb-6 leading-relaxed">{e.detail}</p>
      {code !== "Default" && (
        <p className="text-[11px] font-mono text-text-muted mb-8">error code: {code}</p>
      )}
      <Link
        href="/auth/signin"
        className="inline-flex items-center gap-2 bg-accent-blue hover:bg-accent-blue/80 text-white rounded-input px-4 py-2 text-sm font-medium transition-colors duration-150"
      >
        Try again
      </Link>
    </>
  );
}

export default function AuthErrorPage() {
  return (
    <div className="min-h-screen bg-background-base flex items-center justify-center p-4">
      <div className="w-full max-w-sm text-center">
        <Suspense fallback={<p className="text-text-secondary text-sm">Loading…</p>}>
          <AuthErrorContent />
        </Suspense>
      </div>
    </div>
  );
}
