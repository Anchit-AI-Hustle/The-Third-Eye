import { describe, expect, it } from "vitest";
import { localDay, validZone } from "@/lib/localDay";

// 20:30 UTC on 16 Oct is already 17 Oct in India and still 16 Oct in New York.
const late = new Date("2026-10-16T20:30:00Z");

describe("localDay", () => {
  it("is the day where the user is, not the UTC day", () => {
    expect(localDay(late, "Asia/Kolkata")).toBe("2026-10-17");
    expect(localDay(late, "America/New_York")).toBe("2026-10-16");
    expect(localDay(late, "UTC")).toBe("2026-10-16");
  });

  it("falls back to UTC for a zone that does not exist", () => {
    expect(validZone("Mars/Base")).toBe("UTC");
    expect(localDay(late, "Mars/Base")).toBe("2026-10-16");
  });
});
