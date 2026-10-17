import { describe, expect, it } from "vitest";
import { ANDROID_APK_URL, installPlatform } from "@/lib/installPlatform";

const IPHONE_SAFARI = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const IPHONE_CHROME = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0 Mobile/15E148 Safari/604.1";
const IPAD_DESKTOP_MODE = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
const ANDROID = "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36";
const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

describe("which install path a visitor gets", () => {
  it("sends Android phones to the APK", () => {
    expect(installPlatform(ANDROID, { touch: true, standalone: false })).toBe("android");
  });

  it("walks iPhones in Safari through Add to Home Screen", () => {
    expect(installPlatform(IPHONE_SAFARI, { touch: true, standalone: false })).toBe("ios-safari");
  });

  it("tells iPhones in another browser to open Safari first", () => {
    expect(installPlatform(IPHONE_CHROME, { touch: true, standalone: false })).toBe("ios-other");
  });

  it("treats an iPad asking for the desktop site as iOS", () => {
    expect(installPlatform(IPAD_DESKTOP_MODE, { touch: true, standalone: false })).toBe("ios-safari");
  });

  it("shows both options on a computer", () => {
    expect(installPlatform(MAC, { touch: false, standalone: false })).toBe("desktop");
  });

  it("knows when it is already running as the installed app", () => {
    expect(installPlatform(IPHONE_SAFARI, { touch: true, standalone: true })).toBe("installed");
  });

  it("links a stable public APK that needs no sign-in", () => {
    expect(ANDROID_APK_URL).toBe("https://github.com/Anchit-AI-Hustle/The-Third-Eye/releases/download/android-latest/the-third-eye.apk");
  });
});
