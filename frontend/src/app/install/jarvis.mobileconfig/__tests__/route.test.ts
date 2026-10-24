import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => vi.unstubAllGlobals());

describe("/install/jarvis.mobileconfig", () => {
  it("serves the profile with the type iOS installs, the app icon embedded", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array([1, 2, 3]))));
    const { GET } = await import("@/app/install/jarvis.mobileconfig/route");
    const res = await GET(new Request("https://app.test/install/jarvis.mobileconfig"));
    expect(res.headers.get("content-type")).toBe("application/x-apple-aspen-config");
    const body = await res.text();
    expect(body).toContain("<key>Icon</key><data>AQID</data>");
    expect(body).toContain("<string>https://app.test/dashboard?app=webclip</string>");
  });
});
