"use client";

import { useEffect } from "react";

export default function NotesError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Notes error:", error);
  }, [error]);

  return (
    <div className="flex-1 flex items-center justify-center px-4">
      <div className="max-w-md w-full holo-card rounded-card p-6 text-center">
        <div className="w-12 h-12 rounded-full bg-accent-red/10 border border-accent-red/20 flex items-center justify-center mx-auto mb-4">
          <span className="text-accent-red text-lg">⚠</span>
        </div>
        <h2 className="font-display text-lg font-bold text-text-primary mb-2">
          Notes unavailable
        </h2>
        <p className="text-text-secondary text-sm mb-5">
          The notes editor hit an error. Your data is stored locally and is safe.
        </p>
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => reset()}
            className="px-4 py-2.5 rounded-input bg-accent-blue/10 border border-accent-blue/30 text-accent-blue text-sm font-medium hover:bg-accent-blue/20 transition-colors"
          >
            Try again
          </button>
          <a
            href="/dashboard"
            className="px-4 py-2.5 rounded-input border border-border-default text-text-secondary text-sm hover:text-text-primary hover:border-border-hover transition-colors"
          >
            Dashboard
          </a>
        </div>
      </div>
    </div>
  );
}
