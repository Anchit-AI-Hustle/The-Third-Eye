// Job Agent feature flags + tunables. Server-safe (no secrets leak to client
// because only booleans are exposed via the public flag). Everything defaults
// to a safe, disabled-but-not-broken state when env vars are absent.

export const JOB_AGENT = {
  /** Master switch. When false the /job-agent routes show a disabled state. */
  enabled: process.env.JOB_AGENT_ENABLED !== "false", // on by default; set "false" to hide
  /** Application automation (browser assistant + form fill). Off by default. */
  automationEnabled: process.env.JOB_AGENT_AUTOMATION_ENABLED === "true",
  /** Per-source timeout for concurrent job search. */
  sourceTimeoutMs: Number(process.env.JOB_AGENT_SOURCE_TIMEOUT_MS) || 8000,
  /** Max upload size for resume import. */
  maxUploadMb: Number(process.env.JOB_AGENT_MAX_UPLOAD_MB) || 8,
  /** Adzuna inline source is only usable when both creds are present. */
  adzunaConfigured: !!(process.env.ADZUNA_APP_ID && process.env.ADZUNA_APP_KEY),
} as const;

// A public, secret-free snapshot safe to hand to client components.
export function publicJobAgentFlags() {
  return {
    enabled: JOB_AGENT.enabled,
    automationEnabled: JOB_AGENT.automationEnabled,
  };
}
