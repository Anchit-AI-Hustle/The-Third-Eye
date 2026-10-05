"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";

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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(
    initialError ? ERROR_TEXT[initialError] ?? "Sign-in didn't finish. Continue once more." : null,
  );

  async function withGoogle() {
    setBusy(true);
    setError(null);
    try {
      await signIn("google", { callbackUrl });
    } catch {
      setBusy(false);
      setError("Could not reach Google. Check your connection and try again.");
    }
  }

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

          {error && (
            <div className="mb-5 p-3 bg-accent-red/10 border border-accent-red/20 rounded-input text-accent-red text-sm text-center">
              {error}
            </div>
          )}

          <button
            onClick={withGoogle}
            disabled={busy}
            className="w-full flex items-center justify-center gap-2 bg-accent-blue hover:brightness-110 rounded-input px-4 h-12 text-white text-sm font-medium transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
          >
            {busy ? "Opening Google…" : "Continue with Google"}
          </button>
        </div>
      </div>
    </div>
  );
}
