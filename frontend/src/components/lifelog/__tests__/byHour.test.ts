import { describe, expect, it } from "vitest";
import { byHour } from "@/components/lifelog/LifeLog";
import { emptyDay } from "@/lib/lifelog/types";

const at = (h: number, m = 0) => new Date(2026, 10, 8, h, m).getTime();

describe("byHour", () => {
  it("files events, recordings, follow-ups and diary under the hour they happened", () => {
    const day = {
      ...emptyDay("2026-11-08"),
      events: [{ id: "e", ts: at(9, 40), title: "Standup", kind: "meeting" }],
      segments: [
        { id: "s1", startTs: at(9, 5), endTs: at(9, 6), transcript: "morning standup", hasAudio: true },
        { id: "s2", startTs: at(14, 1), endTs: at(14, 2), transcript: "", hasAudio: false, silent: true },
      ],
      diary: [{ id: "d", ts: at(21), text: "Good day" }],
      actions: [{ type: "reminder" as const, title: "Call mum", when: "2026-11-08T18:00", needsYou: true, saved: true }],
    };
    const hours = byHour(day);
    expect(hours.map((h) => h.hour)).toEqual([9, 18, 21]);
    expect(hours[0].events[0].title).toBe("Standup");
    expect(hours[0].audio.map((s) => s.id)).toEqual(["s1"]);
    expect(hours[0].transcript).toContain("morning standup");
    expect(hours[1].actions[0].title).toBe("Call mum");
    expect(hours[2].diary[0].text).toBe("Good day");
  });
});
