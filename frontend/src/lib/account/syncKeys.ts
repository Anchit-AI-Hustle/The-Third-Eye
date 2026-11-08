// Which of this browser's stored values belong to the person rather than the
// device. These follow the account to every device it signs in on; anything
// else (mic and voice downloads per device, the device id, install prompts,
// per-device permission answers, "always listen" on this device) stays local.

const EXACT = new Set([
  "jarvis_agent_profiles", "jarvis_active_agent",
  "te_mode_tags_v1", "te_active_mode",
  "jarvis_activation_config", "jarvis_wake_enabled", "jarvis_wakeword",
  "te_agent_killed", "te_agent_audit_v1",
  "te_skills_v1",
  "thirdeye_chat_history",
  "jarvis_capture_sessions_v1", "te_capture_autocreate",
  "jarvis_tts_enabled_v2", "jarvis_intro_spoken_v1",
  "te_first_run_done", "te_welcome_seen",
]);

const PREFIXES = ["jarvis_memory_v1_", "jarvis_checkpoints_v1_", "jarvis_briefing_", "book-studio:", "te_welcomed_v1:"];

// Device-vault keys carry this device's id; across devices they are one value.
const VAULT = /^te_vault:[^:]+:(.+)$/;

/** The account-wide name for a local key, or null when it stays on this device. */
export function cloudKey(localKey: string): string | null {
  const v = VAULT.exec(localKey);
  if (v) return `vault:${v[1]}`;
  if (EXACT.has(localKey) || PREFIXES.some((p) => localKey.startsWith(p))) return localKey;
  return null;
}

/** Where an account-wide value lives on this device. */
export function localKey(cloud: string, deviceId: string): string | null {
  if (cloud.startsWith("vault:")) return `te_vault:${deviceId}:${cloud.slice(6)}`;
  return cloudKey(cloud) === cloud ? cloud : null;
}

export const MAX_VALUE_CHARS = 256_000;
