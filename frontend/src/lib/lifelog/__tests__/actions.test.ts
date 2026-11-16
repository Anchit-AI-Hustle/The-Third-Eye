import { describe, expect, it } from "vitest";
import { cleanActions } from "@/lib/lifelog/actions";

describe("cleanActions", () => {
  it("keeps a reminder only when it has a time, otherwise files it as a task", () => {
    expect(cleanActions([{ type: "reminder", title: "Pay rent" }], "2026-11-08")).toEqual([
      { type: "task", title: "Pay rent", detail: undefined, steps: undefined, when: undefined, needsYou: false },
    ]);
  });

  it("anchors a bare HH:MM to the day and keeps a full date as given", () => {
    const [a, b] = cleanActions([
      { type: "reminder", title: "Standup", when: "9:30" },
      { type: "task", title: "Ship", when: "2026-11-10T17:00:00Z", needsYou: true },
    ], "2026-11-08");
    expect(a.when).toBe("2026-11-08T09:30");
    expect(b).toMatchObject({ when: "2026-11-10T17:00", needsYou: true });
  });

  it("drops untitled items and anything that is not a list", () => {
    expect(cleanActions([{ title: " " }, null], "2026-11-08")).toEqual([]);
    expect(cleanActions("nope", "2026-11-08")).toEqual([]);
  });
});
