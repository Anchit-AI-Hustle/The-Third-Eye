import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readDemoSettings, resolveDemoSettings, saveDemoSettings, validEmail } from "./demo-config.mjs";

test("a saved setup account is reused when npm run demo:record has no env vars", () => {
  const saved = { testEmail: "owner@gmail.com", recipient: "owner@gmail.com", calendarEvent: "Demo event" };
  assert.deepEqual(resolveDemoSettings({}, saved), saved);
});

test("recipient defaults to the test account when none is provided", () => {
  const result = resolveDemoSettings({ TEST_EMAIL: "owner@gmail.com" });
  assert.equal(result.testEmail, "owner@gmail.com");
  assert.equal(result.recipient, "owner@gmail.com");
  assert.equal(result.calendarEvent, "");
});

test("an account switch cannot inherit another account's test recipient or calendar fixture", () => {
  const result = resolveDemoSettings({ TEST_EMAIL: "reviewer@gmail.com" }, {
    testEmail: "owner@gmail.com", recipient: "owner-second@gmail.com", calendarEvent: "Owner private event",
  });
  assert.deepEqual(result, {
    testEmail: "reviewer@gmail.com", recipient: "reviewer@gmail.com", calendarEvent: "",
  });
});

test("explicit flags override saved settings and no credentials are written", () => {
  const prefs = { testEmail: "owner@gmail.com", recipient: "old@gmail.com", calendarEvent: "Old event" };
  const result = resolveDemoSettings({
    TEST_EMAIL: "owner@gmail.com", RECIPIENT: "new@gmail.com", DEMO_EVENT_TITLE: "New event",
  }, prefs);
  assert.equal(result.recipient, "new@gmail.com");
  assert.equal(result.calendarEvent, "New event");
  const dir = mkdtempSync(join(tmpdir(), "third-eye-oauth-config-"));
  const path = join(dir, "profile", "oauth-demo-settings.json");
  saveDemoSettings(path, result);
  assert.deepEqual(readDemoSettings(path), result);
  const saved = readFileSync(path, "utf8");
  assert.ok(!saved.includes("access_token"));
  assert.ok(!saved.includes("password"));
  if (process.platform !== "win32") assert.equal(statSync(path).mode & 0o777, 0o600);
});

test("invalid or placeholder addresses fail fast", () => {
  assert.equal(validEmail("owner@gmail.com"), true);
  assert.equal(validEmail("owner@example.com"), false);
  assert.equal(validEmail("invalid"), false);
  assert.equal(validEmail(undefined), false);
});

test("absent preferences are handled without crashing", () => {
  assert.deepEqual(readDemoSettings("/nonexistent/third-eye-oauth-config.json"), {});
});
