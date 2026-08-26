"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";

// NextAuth redirects here with ?error=<code>. Map each code to something the
// operator can act on, and always surface the raw code — a generic "an error
// occurred" hides whether the problem is a redirect-URI mismatch, a consent
// screen still in Testing mode, or missing server env.
const ERRORS: Record<string, { title: string; detail: string }> = {
  Configuration: {
    title: "Server isn't configured for sign-in",
    detail:
      "The Google credentials or NextAuth secret are missing on the server. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, NEXTAUTH_SECRET and NEXTAUTH_URL in the deployment environment.",
  },
  AccessDenied: {
    title: "Google blocked the sign-in",
    detail:
      "Either you dismissed the consent screen, or this account isn’t on the OAuth consent screen’s test-users list. Sign-in requests restricted Gmail scopes, so publishing the app is NOT enough on its own — until Google’s verification review completes, only listed test users can sign in. Add the account under OAuth consent screen → Test users in Google Cloud Console (docs/GOOGLE_OAUTH.md covers the review and the one-line rollback to identity-only scopes).",
  },
  OAuthSignin: {
    title: "Couldn’t start the Google sign-in",
    detail:
      "Usually the client ID/secret is wrong, or the app’s authorized origin doesn’t match. Check the OAuth client in Google Cloud Console.",
  },
  OAuthCallback: {
    title: "Google rejected the callback",
    detail:
      "This is almost always a redirect-URI mismatch. Add exactly “<this-origin>/api/auth/callback/google” to Authorized redirect URIs on the OAuth client, and make sure NEXTAUTH_URL matches this origin.",
  },
  OAuthAccountNotLinked: {
    title: "That email is linked to a different sign-in method",
    detail: "Use the provider you originally signed in with for this email.",
  },
  Verification: {
    title: "This sign-in link has expired",
    detail: "Request a fresh link and try again.",
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
