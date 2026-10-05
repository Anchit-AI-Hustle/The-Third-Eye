import { describe, expect, it } from "vitest";
import { MAX_VIDEO_SECONDS, renderLength } from "@/lib/musicVideo";

describe("music video length", () => {
  it("records the clip, and a longer session only up to the cap", () => {
    expect(renderLength(30)).toBe(30);
    expect(renderLength(15, 30)).toBe(30);
    expect(renderLength(12, 18_000)).toBe(MAX_VIDEO_SECONDS);
    expect(MAX_VIDEO_SECONDS).toBeLessThanOrEqual(60);
  });

  it("never asks for a zero-length recording", () => {
    expect(renderLength(0)).toBe(1);
    expect(renderLength(Number.NaN, 4)).toBe(4);
  });
});
