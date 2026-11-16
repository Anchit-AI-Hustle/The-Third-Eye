import { describe, expect, it } from "vitest";
import { MAX_VIDEO_SECONDS, renderLength } from "@/lib/musicVideo";

describe("music video length", () => {
  it("records the clip, and a longer session only up to the cap", () => {
    expect(renderLength(30)).toBe(30);
    expect(renderLength(15, 30)).toBe(30);
    expect(renderLength(12, 18_000)).toBe(MAX_VIDEO_SECONDS);
    expect(MAX_VIDEO_SECONDS).toBe(300);
  });

  it("always covers the whole song, however long", () => {
    // A 2:59 song came back as a 48 s video.
    expect(renderLength(179)).toBe(179);
    expect(renderLength(179, 180)).toBe(180);
    expect(renderLength(420, 18_000)).toBe(420);
  });

  it("never asks for a zero-length recording", () => {
    expect(renderLength(0)).toBe(1);
    expect(renderLength(Number.NaN, 4)).toBe(4);
  });
});
