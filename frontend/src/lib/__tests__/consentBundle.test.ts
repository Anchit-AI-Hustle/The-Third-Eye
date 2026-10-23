import { afterEach, describe, expect, it, vi } from "vitest";
import { CONSENT_TIMEOUT_MS, requestConsentBundle } from "@/lib/consent";

describe("requestConsentBundle", () => {
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it("finishes even when a permission prompt never answers, as in an embedded web view", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("Notification", { permission: "default", requestPermission: () => new Promise(() => {}) });
    const done = requestConsentBundle(["notifications", "microphone"]);
    await vi.advanceTimersByTimeAsync(CONSENT_TIMEOUT_MS + 1);
    await expect(done).resolves.toEqual({ notifications: "prompt", microphone: "granted" });
  });
});
