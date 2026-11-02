import { describe, expect, it } from "vitest";
import { deleteRoutine, matchRoutine, readRoutines, routineBrief, runInstant, saveRoutine } from "@/lib/routines";

describe("routines", () => {
  it("saves, lists and deletes a routine by name", () => {
    const store: Record<string, string> = {};
    expect(saveRoutine(store, "Focus Mode", ["open gmail", "open calendar"])).toContain('Saved routine "Focus Mode"');
    expect(readRoutines(store)).toEqual([{ name: "Focus Mode", steps: ["open gmail", "open calendar"] }]);
    expect(deleteRoutine(store, "focus mode")).toBe('Deleted routine "focus mode".');
    expect(readRoutines(store)).toEqual([]);
  });

  it("refuses a routine without a name or steps", () => {
    const store: Record<string, string> = {};
    expect(saveRoutine(store, " ", ["open gmail"])).toMatch(/needs a name/);
    expect(saveRoutine(store, "Empty", [" "])).toMatch(/needs a name/);
    expect(store).toEqual({});
  });

  it("is triggered by its name, with or without 'run' and 'routine'", () => {
    const store: Record<string, string> = {};
    saveRoutine(store, "Focus Mode", ["open gmail"]);
    for (const said of ["Focus mode", "focus mode.", "Run focus mode", "Hey Jarvis, start my focus mode routine", "activate the Focus Mode shortcut please"]) {
      expect(matchRoutine(said, store)?.name).toBe("Focus Mode");
    }
    expect(matchRoutine("what is focus mode in iOS", store)).toBeNull();
    expect(matchRoutine("focus", store)).toBeNull();
  });

  it("runs instantly, with no model, when every step is an open", () => {
    const store: Record<string, string> = {};
    saveRoutine(store, "Morning", ["open gmail", "open my tasks"]);
    const run = runInstant(matchRoutine("morning", store)!);
    expect(run?.text).toMatch(/^Running Morning\./);
    expect(run?.sideEffects).toHaveLength(2);
    expect(run?.sideEffects.every((fx) => fx.type === "open_url")).toBe(true);
  });

  it("hands a routine with any other step to the assistant, steps spelled out", () => {
    const store: Record<string, string> = {};
    saveRoutine(store, "Wind down", ["open spotify", "remind me to sleep at 11pm"]);
    const r = matchRoutine("wind down", store)!;
    expect(runInstant(r)).toBeNull();
    expect(routineBrief(r)).toContain("1. open spotify\n2. remind me to sleep at 11pm");
  });
});
