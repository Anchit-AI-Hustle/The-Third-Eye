// Local-only configuration for the Google OAuth verification recording.
// We persist only account addresses and a test Calendar event title, never tokens.
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export function validEmail(value) {
  return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && !value.toLowerCase().endsWith("@example.com");
}

export function readDemoSettings(path) {
  try {
    if (!existsSync(path)) return {};
    const settings = JSON.parse(readFileSync(path, "utf8"));
    return settings && typeof settings === "object" ? settings : {};
  } catch {
    return {};
  }
}

export function resolveDemoSettings(env = {}, saved = {}) {
  const testEmail = (env.TEST_EMAIL || saved.testEmail || "").trim();
  const sameAccount = saved.testEmail?.toLowerCase() === testEmail.toLowerCase();
  return {
    testEmail,
    // Never reuse a previous account's recipient or Calendar details after an account switch.
    recipient: (env.RECIPIENT || (sameAccount && saved.recipient) || testEmail).trim(),
    calendarEvent: (env.DEMO_EVENT_TITLE || (sameAccount && saved.calendarEvent) || "").trim(),
  };
}

export function saveDemoSettings(path, settings) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, JSON.stringify({
    testEmail: settings.testEmail,
    recipient: settings.recipient,
    calendarEvent: settings.calendarEvent,
  }, null, 2), { mode: 0o600 });
  chmodSync(path, 0o600);
}
