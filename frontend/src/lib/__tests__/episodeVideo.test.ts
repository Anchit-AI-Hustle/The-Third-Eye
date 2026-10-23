import { describe, expect, it } from "vitest";
import { drawnScene, planTimeline, shotLengths } from "@/lib/episodeVideo";

describe("episode assembly", () => {
  it("gives a drawn shot its planned length and a rendered one its clip's", () => {
    expect(shotLengths([{ seconds: 6 }, { clip: 4.2 }, {}])).toEqual([6, 4.2, 5]);
    const segs = planTimeline(shotLengths([{ seconds: 6 }, { clip: 4 }]).map((clip) => ({ clip, voice: 0 })));
    expect(segs.map((s) => s.end - s.start)).toEqual([3, 6, 4, 2]);
  });

  it("draws each scene in its own look, the same every time", () => {
    const a = drawnScene(0, "Sunrise over the city");
    expect(drawnScene(0, "Sunrise over the city")).toEqual(a);
    expect(drawnScene(1, "Sunrise over the city")).not.toEqual(a);
    expect(a.colors).toHaveLength(3);
    for (const c of a.colors) expect(c).toMatch(/^hsl\(\d+ \d+% \d+%\)$/);
    expect(a.orbs.length).toBeGreaterThanOrEqual(5);
    for (const o of a.orbs) {
      expect(o.x).toBeGreaterThanOrEqual(0); expect(o.x).toBeLessThanOrEqual(1);
      expect(o.r).toBeGreaterThan(0);
    }
  });
});
