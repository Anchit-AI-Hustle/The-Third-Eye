import { describe, expect, it } from "vitest";
import { webClipProfile } from "@/lib/webClip";

describe("the iPhone install profile", () => {
  const xml = webClipProfile("https://the-third-eye.anchit-tandon.com", "aWNvbg==");

  it("is a configuration profile holding one full-screen web clip of the app", () => {
    expect(xml).toMatch(/^<\?xml version="1.0" encoding="UTF-8"\?>/);
    expect(xml).toContain("<key>PayloadType</key><string>Configuration</string>");
    expect(xml).toContain("<key>PayloadType</key><string>com.apple.webClip.managed</string>");
    expect(xml).toContain("<key>URL</key><string>https://the-third-eye.anchit-tandon.com/dashboard</string>");
    expect(xml).toContain("<key>Label</key><string>JARVIS</string>");
    expect(xml).toContain("<key>FullScreen</key><true/>");
    expect(xml).toContain("<key>Icon</key><data>aWNvbg==</data>");
  });

  it("keeps the same identifiers, so installing again replaces the icon instead of adding a second", () => {
    expect(webClipProfile("https://x.test", "")).toBe(webClipProfile("https://x.test", ""));
    expect(xml.match(/<key>PayloadUUID<\/key><string>[0-9A-F-]{36}<\/string>/g)).toHaveLength(2);
  });
});
