"use client";

import { signIn, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function SignInPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "authenticated") {
      router.push("/dashboard");
    }
  }, [status, router]);

  async function handleGoogleSignIn() {
    setIsLoading(true);
    setError(null);
    try {
      await signIn("google", { callbackUrl: "/dashboard" });
    } catch {
      setError("Sign in failed. Please try again.");
      setIsLoading(false);
    }
  }

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-background-base flex items-center justify-center">
        <div className="animate-pulse text-text-muted font-mono text-sm">Initializing...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background-base flex items-center justify-center">
      <div className="w-full max-w-sm">
        {/* Logo / Title */}
        <div className="text-center mb-12">
          <h1 className="font-display text-3xl font-semibold text-text-primary tracking-tight">
            JARVIS OS
          </h1>
          <p className="mt-2 text-text-secondary text-sm">
            Your AI-powered personal operating system
          </p>
        </div>

        {/* Auth Card */}
        <div className="bg-background-surface border border-border-default rounded-card p-8 shadow-elevated">
          <h2 className="text-text-primary font-semibold mb-6 text-center">Sign in</h2>

          {error && (
            <div className="mb-4 p-3 bg-accent-red/10 border border-accent-red/20 rounded-input text-accent-red text-sm">
              {error}
            </div>
          )}

          <button
            onClick={handleGoogleSignIn}
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-3 bg-background-elevated hover:bg-border-hover border border-border-default rounded-input px-4 py-3 text-text-primary text-sm font-medium transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <span className="text-text-muted">Connecting...</span>
            ) : (
              <>
                <GoogleIcon />
                Continue with Google
              </>
            )}
          </button>

          <div className="mt-6 text-center">
            <p className="text-text-muted text-xs">
              By signing in, you agree to our terms. Your data is self-hosted
              and never shared.
            </p>
          </div>
        </div>

        <div className="mt-6 text-center">
          <span className="text-text-muted text-xs font-mono">v0.1.0 · Phase 1</span>
        </div>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path
        d="M15.68 8.18c0-.57-.05-1.11-.14-1.64H8v3.1h4.29a3.67 3.67 0 01-1.59 2.41v2h2.57c1.5-1.38 2.41-3.42 2.41-5.87z"
        fill="#4285F4"
      />
      <path
        d="M8 16c2.16 0 3.97-.71 5.29-1.93l-2.57-2a4.77 4.77 0 01-2.72.76c-2.1 0-3.87-1.41-4.5-3.32H.84v2.07A8 8 0 008 16z"
        fill="#34A853"
      />
      <path
        d="M3.5 9.51A4.82 4.82 0 013.25 8c0-.52.09-1.03.25-1.51V4.42H.84A8 8 0 000 8c0 1.29.31 2.51.84 3.58l2.66-2.07z"
        fill="#FBBC05"
      />
      <path
        d="M8 3.18c1.18 0 2.24.41 3.07 1.2l2.3-2.3A8 8 0 00.84 4.42L3.5 6.49C4.13 4.59 5.9 3.18 8 3.18z"
        fill="#EA4335"
      />
    </svg>
  );
}
