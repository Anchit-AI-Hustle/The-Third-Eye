"use client";

import { getCsrfToken } from "next-auth/react";
import { useState, type FormEvent } from "react";

const ERROR_TEXT: Record<string, string> = {
  AccessDenied: "Google didn't allow that sign-in. It only needs your name and email.",
  OAuthCallback: "Google didn't finish. Continue once more.",
  Callback: "Google didn't finish. Continue once more.",
  OAuthSignin: "Couldn't start Google sign-in.",
  Configuration: "Sign-in isn't configured on the server.",
};

export function SignInClient({
  callbackUrl,
  initialError,
}: {
  callbackUrl: string;
  initialError: string | null;
}) {
  const [csrfError, setCsrfError] = useState(false);
  const [busy, setBusy] = useState(false);

  async function startGoogle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setBusy(true);
    setCsrfError(false);
    try {
      const token = await getCsrfToken();
      if (!token) {
        setBusy(false);
        setCsrfError(true);
        return;
      }
      const input = form.elements.namedItem("csrfToken");
      if (input instanceof HTMLInputElement) input.value = token;
      // Native submit. A second React onSubmit would fetch again and rotate the cookie.
      form.submit();
    } catch {
      setBusy(false);
      setCsrfError(true);
    }
  }

  const message = csrfError
    ? "Couldn't start Google sign-in."
    : initialError
      ? (ERROR_TEXT[initialError] ?? "Sign-in didn't finish. Continue once more.")
      : null;

  return (
    <div className="min-h-screen bg-background-base flex flex-col items-center justify-center px-4 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-accent-blue/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 left-1/3 w-[400px] h-[400px] bg-accent-violet/5 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-sm">
        <div className="flex flex-col items-center mb-10">
          <div className="w-20 h-20 rounded-2xl bg-accent-blue/10 border border-accent-blue/20 overflow-hidden mb-5 shadow-elevated">
            <img
              src="/logo.png"
              alt="The Third Eye"
              className="w-full h-full object-cover"
              onError={(e) => {
                const el = e.target as HTMLImageElement;
                el.style.display = "none";
                el.parentElement!.innerHTML = `<div class="w-full h-full flex items-center justify-center text-accent-blue font-bold text-2xl font-display">👁</div>`;
              }}
            />
          </div>
          <h1 className="font-display text-3xl md:text-4xl font-bold text-text-primary tracking-tight">
            The Third Eye
          </h1>
          <p className="text-text-secondary text-sm mt-2">
            Your Personal Intelligence Operating System
          </p>
        </div>

        <div className="bg-background-surface border border-border-default rounded-card p-8 shadow-elevated">
          <h2 className="text-text-primary font-semibold text-base mb-1 text-center">
            Sign in to continue
          </h2>
          <p className="text-text-muted text-xs text-center mb-6">
            One Google step. It asks for your name and email, then opens your workspace.
          </p>

          {message && (
            <div
              role="alert"
              className="mb-5 p-3 bg-accent-red/10 border border-accent-red/20 rounded-input text-accent-red text-sm text-center"
            >
              {message}
              {initialError && !csrfError && (
                <p className="mt-1 text-xs text-text-muted">{initialError}</p>
              )}
            </div>
          )}

          {/* fetch(signIn) sets the state cookie on a background response. Chrome
              drops that cookie on the way back from Google, so the callback
              looks like a new sign-in. A form POST sets it on this navigation. */}
          <form
            method="post"
            action="/api/auth/signin/google"
            className="w-full"
            onSubmit={startGoogle}
          >
            <input type="hidden" name="csrfToken" value="" />
            <input type="hidden" name="callbackUrl" value={callbackUrl} />
            <button
              type="submit"
              disabled={busy}
              className="w-full flex items-center justify-center gap-2 bg-accent-blue hover:brightness-110 rounded-input px-4 h-12 text-white text-sm font-medium transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
            >
              {busy ? "Opening Google…" : "Continue with Google"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
