import { afterEach, describe, expect, it, vi } from "vitest";
import { speechRecognizer } from "@/lib/speechRecognizer";

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
class WebkitSR {}

function env(ua: string, standalone: boolean) {
  vi.stubGlobal("navigator", { ...navigator, userAgent: ua, platform: "iPhone", maxTouchPoints: 5, standalone });
  vi.stubGlobal("webkitSpeechRecognition", WebkitSR);
}
afterEach(() => { vi.unstubAllGlobals(); delete (window as { Capacitor?: unknown }).Capacitor; });

describe("speechRecognizer", () => {
  it("uses Safari's recognizer in a normal iPhone tab", () => {
    env(IPHONE, false);
    expect(speechRecognizer()).toBe(WebkitSR);
  });

  it("skips it in an iPhone home-screen app, where it fails and steals the mic", () => {
    env(IPHONE, true);
    expect(speechRecognizer()).toBeNull();
  });

  it("skips it in the native iPhone app too, where the web view's recognizer fails the same way", () => {
    env("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148", false);
    (window as { Capacitor?: unknown }).Capacitor = { getPlatform: () => "ios" };
    expect(speechRecognizer()).toBeNull();
  });

  it("keeps it in an installed Android app", () => {
    env("Mozilla/5.0 (Linux; Android 14; Pixel 7) Chrome/130.0 Mobile Safari/537.36", true);
    expect(speechRecognizer()).toBe(WebkitSR);
  });
});
