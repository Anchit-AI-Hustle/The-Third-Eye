// @vitest-environment node
import { describe, expect, it } from "vitest";
import { GET } from "@/app/get/route";
import { ANDROID_APK_URL } from "@/lib/installPlatform";

const open = (ua: string) => GET(new Request("https://the-third-eye.anchit-tandon.com/get", { headers: { "user-agent": ua } }));

describe("/get, the one link to send to a phone", () => {
  it("starts the app download on Android", async () => {
    const res = await open("Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36");
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(ANDROID_APK_URL);
  });

  it("starts the home-screen install on an iPhone in Safari", async () => {
    const res = await open("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1");
    expect(res.headers.get("location")).toBe("https://the-third-eye.anchit-tandon.com/install/jarvis.mobileconfig");
  });

  it("sends other browsers to the install page, which explains what to do", async () => {
    for (const ua of ["Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) CriOS/130 Mobile Safari/604.1", "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) Safari/605.1.15"]) {
      expect((await open(ua)).headers.get("location")).toBe("https://the-third-eye.anchit-tandon.com/install");
    }
  });
});
