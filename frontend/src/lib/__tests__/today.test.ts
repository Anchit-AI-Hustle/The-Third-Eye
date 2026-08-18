import { describe, expect, it } from "vitest";

import { todayBlock, todayIn } from "@/lib/tools/today";

// The assistant was asked to turn "tomorrow" into a YYYY-MM-DD due date with
// nothing in the prompt saying what day it is, so it answered from its training
// data and created tasks that were already overdue.

// 2026-08-18T19:30Z — the same instant is the 19th in Asia/Kolkata and still
// the 18th in New York.
const instant = new Date("2026-08-18T19:30:00Z");

describe("resolving the operator's day", () => {
  it("uses their timezone, not the server's", () => {
    expect(todayIn("Asia/Kolkata", instant).date).toBe("2026-08-19");
    expect(todayIn("America/New_York", instant).date).toBe("2026-08-18");
  });

  it("names the weekday, which is what 'Friday' is resolved against", () => {
    expect(todayIn("UTC", instant).weekday).toBe("Tuesday");
  });

  it("falls back to UTC when no timezone is sent", () => {
    expect(todayIn(undefined, instant)).toMatchObject({ date: "2026-08-18", zone: "UTC" });
  });

  it("falls back to UTC rather than throwing on a junk timezone", () => {
    expect(todayIn("Mars/Olympus", instant).zone).toBe("UTC");
  });

  it("pads single-digit months and days into the format tasks store", () => {
    expect(todayIn("UTC", new Date("2026-01-05T12:00:00Z")).date).toBe("2026-01-05");
  });
});

describe("what the model is told", () => {
  const block = todayBlock("Asia/Kolkata", instant);

  it("states the date it must count from", () => {
    expect(block).toContain("2026-08-19");
    expect(block).toContain("Wednesday");
    expect(block).toContain("Asia/Kolkata");
  });

  it("ties relative dates to it", () => {
    expect(block).toMatch(/tomorrow/i);
    expect(block).toMatch(/never write a date in the past/i);
  });
});
