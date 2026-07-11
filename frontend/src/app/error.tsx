"use client";

import { useEffect } from "react";

// Route-segment error boundary. Without one, any thrown error in a client
// component collapses the whole app into Next.js's opaque "a client-side
// exception has occurred" message. This surfaces the real error so failures
// are diagnosable in production, and offers a recovery path.
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error("App error boundary:", error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background-base px-4">
      <div className="max-w-lg w-full holo-card rounded-card p-6">
        <h1 className="font-display text-xl font-bold text-accent-red mb-2">
          Something went wrong
        </h1>
        <p className="text-text-secondary text-sm mb-4">
          The interface hit an unexpected error. Details below help diagnose it.
        </p>
        <pre className="text-[11px] font-mono whitespace-pre-wrap break-words bg-background-surface border border-border-default rounded-input p-3 text-text-muted max-h-64 overflow-auto">
          {error?.message || "Unknown error"}
          {error?.digest ? `\n\ndigest: ${error.digest}` : ""}
          {error?.stack ? `\n\n${error.stack}` : ""}
        </pre>
        <div className="flex gap-2 mt-4">
          <button
            onClick={() => reset()}
            className="px-4 py-2 rounded-input bg-[#4FC3F7]/10 border border-[#4FC3F7]/30 text-[#4FC3F7] text-sm hover:bg-[#4FC3F7]/20 transition-colors"
          >
            Try again
          </button>
          <button
            onClick={() => { if (typeof window !== "undefined") window.location.href = "/"; }}
            className="px-4 py-2 rounded-input border border-border-default text-text-secondary text-sm hover:text-text-primary transition-colors"
          >
            Go home
          </button>
        </div>
      </div>
    </div>
  );
}
