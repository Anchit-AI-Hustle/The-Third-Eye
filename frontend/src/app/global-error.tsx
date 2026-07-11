"use client";

import { useEffect } from "react";

// Global error boundary — catches errors thrown in the root layout itself
// (which a route-segment error.tsx cannot). Must render its own <html>/<body>.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error("Global error boundary:", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#050505",
          color: "#e5e5e5",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          padding: "1rem",
        }}
      >
        <div style={{ maxWidth: 560, width: "100%" }}>
          <h1 style={{ color: "#ef4444", fontSize: 20, marginBottom: 8 }}>
            Application error
          </h1>
          <pre
            style={{
              fontSize: 11,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              background: "#111",
              border: "1px solid #333",
              borderRadius: 8,
              padding: 12,
              maxHeight: 280,
              overflow: "auto",
            }}
          >
            {error?.message || "Unknown error"}
            {error?.digest ? `\n\ndigest: ${error.digest}` : ""}
            {error?.stack ? `\n\n${error.stack}` : ""}
          </pre>
          <button
            onClick={() => reset()}
            style={{
              marginTop: 16,
              padding: "8px 16px",
              borderRadius: 8,
              background: "rgba(79,195,247,0.1)",
              border: "1px solid rgba(79,195,247,0.3)",
              color: "#4FC3F7",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
