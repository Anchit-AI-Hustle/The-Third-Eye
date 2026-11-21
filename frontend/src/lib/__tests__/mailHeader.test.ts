import { describe, expect, it } from "vitest";
import { encodeMailHeader } from "@/lib/google/api";

const decode = (h: string) =>
  h.split("\r\n ").map((w) => Buffer.from(w.match(/^=\?UTF-8\?B\?(.*)\?=$/)![1], "base64").toString("utf8")).join("");

describe("encodeMailHeader", () => {
  it("leaves plain ASCII untouched", () => {
    expect(encodeMailHeader("Meeting moved to 3pm")).toBe("Meeting moved to 3pm");
  });
  it("strips newlines so headers cannot be injected", () => {
    expect(encodeMailHeader("Hi\r\nBcc: x@y.com")).toBe("Hi Bcc: x@y.com");
  });
  it("encodes emoji and non-ASCII as RFC 2047 words that round-trip", () => {
    const s = "🗓️ Your JARVIS daily briefing - 2026-11-21 नमस्ते";
    const h = encodeMailHeader(s);
    expect(h).not.toMatch(/[^\x00-\x7f]/);
    for (const w of h.split("\r\n ")) expect(w.length).toBeLessThanOrEqual(75);
    expect(decode(h)).toBe(s);
  });
});
