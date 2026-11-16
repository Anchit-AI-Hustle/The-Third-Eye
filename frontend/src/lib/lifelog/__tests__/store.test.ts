import { describe, expect, it } from "vitest";
import { mergeDays } from "@/lib/lifelog/store";
import { emptyDay } from "@/lib/lifelog/types";

describe("mergeDays", () => {
  it("keeps recordings from both sides, this device's audio, and the newer timeline", () => {
    const mine = { ...emptyDay("2026-11-08"), segments: [{ id: "a", startTs: 1, endTs: 2, transcript: "hi", hasAudio: true }], events: [{ id: "o", ts: 1, title: "Old", kind: "note" }], updatedAt: 10 };
    const cloud = { ...emptyDay("2026-11-08"), segments: [{ id: "a", startTs: 1, endTs: 2, transcript: "hi", hasAudio: false }, { id: "b", startTs: 3, endTs: 4, transcript: "from phone", hasAudio: false }], events: [{ id: "n", ts: 3, title: "New", kind: "note" }], summary: "s", updatedAt: 20 };
    const m = mergeDays(mine, cloud);
    expect(m.segments.map((x) => [x.id, x.hasAudio])).toEqual([["a", true], ["b", false]]);
    expect(m.events[0].title).toBe("New");
    expect(m.summary).toBe("s");
  });
});
