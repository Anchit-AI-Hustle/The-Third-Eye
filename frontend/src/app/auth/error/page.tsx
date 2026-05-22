"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";

export default function AuthErrorPage() {
  const params = useSearchParams();
  const error = params.get("error");

  const errorMessages: Record<string, string> = {
    Configuration: "Server configuration error. Please contact the administrator.",
    AccessDenied: "Access was denied. You may not have permission to sign in.",
    Verification: "Token verification failed. Please try again.",
    Default: "An authentication error occurred.",
  };

  return (
    <div className="min-h-screen bg-background-base flex items-center justify-center">
      <div className="w-full max-w-sm text-center">
        <h1 className="font-display text-xl font-semibold text-text-primary mb-2">
          Sign In Error
        </h1>
        <p className="text-text-secondary text-sm mb-8">
          {error ? errorMessages[error] ?? errorMessages.Default : errorMessages.Default}
        </p>
        <Link
          href="/auth/signin"
          className="inline-flex items-center gap-2 bg-accent-blue hover:bg-accent-blue/80 text-white rounded-input px-4 py-2 text-sm font-medium transition-colors duration-150"
        >
          Try again
        </Link>
      </div>
    </div>
  );
}
