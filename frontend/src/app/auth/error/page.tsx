"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";

// NextAuth redirects here with ?error=<code>. Map each code to something the
// operator can act on, and always surface the raw code — a generic "an error
// occurred" hides whether the problem is missing server env or Google declining the sign-in.
//
const ERRORS: Record<string, { title: string; detail: string }> = {
  Configuration: {
    title: "Server isn't configured for sign-in",
    detail:
      "Sign-in needs GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, NEXTAUTH_SECRET and NEXTAUTH_URL. Set them in the deployment environment.",
  },
  AccessDenied: {
    title: "Google didn't allow that sign-in",
    detail:
      "Google refused this account. Sign-in only needs your name and email. If you were connecting Gmail, that access is still under Google's review, so only a listed test user can allow it until the review finishes.",
  },
  OAuthSignin: {
    title: "Couldn't start Google sign-in",
    detail: "The Google client isn't configured. Check GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.",
  },
  OAuthCallback: {
    title: "Google didn't finish signing you in",
    detail: "The return from Google failed. Try again. If it keeps happening, the redirect URL on the Google client doesn't match this site.",
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
