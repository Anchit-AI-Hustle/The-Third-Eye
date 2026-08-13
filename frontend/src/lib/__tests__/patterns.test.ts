import { describe, it, expect } from "vitest";
import {
  PATTERN_PREFIX,
  encodePattern,
  readPatterns,
  getInsights,
  getHabits,
  learnPattern,
} from "@/lib/patterns";

describe("encodePattern / readPatterns", () => {
  it("round-trips a value and its confidence", () => {
    const store = { [`${PATTERN_PREFIX}habit:gym`]: encodePattern("Trains at 7am", 0.9) };
    expect(readPatterns(store)).toEqual([{ kind: "habit:gym", value: "Trains at 7am", confidence: 0.9 }]);
  });

  it("ignores keys that are not patterns", () => {
    const store = { name: "Anchit", [`${PATTERN_PREFIX}x`]: encodePattern("y", 0.5) };
    expect(readPatterns(store).map((p) => p.kind)).toEqual(["x"]);
  });

  it("treats an unencoded value as fully confident", () => {
    expect(readPatterns({ [`${PATTERN_PREFIX}k`]: "raw value" })[0]).toEqual({
      kind: "k",
      value: "raw value",
      confidence: 1,
    });
  });

  it("sorts by confidence descending", () => {
    const store = {
      [`${PATTERN_PREFIX}a`]: encodePattern("low", 0.2),
      [`${PATTERN_PREFIX}b`]: encodePattern("high", 0.95),
    };
    expect(readPatterns(store).map((p) => p.kind)).toEqual(["b", "a"]);
  });

  it("returns nothing for an empty store", () => {
    expect(readPatterns({})).toEqual([]);
  });
});

describe("learnPattern", () => {
  it("writes through to the store so the turn can persist it", () => {
    const store: Record<string, string> = {};
    learnPattern("habit:coffee", "Two cups before noon", 0.8, store);
    expect(store[`${PATTERN_PREFIX}habit:coffee`]).toBe("Two cups before noon (confidence 80%)");
  });

  it("no longer claims persistence is pending", () => {
    const out = learnPattern("k", "v", 0.8, {});
    expect(out).not.toMatch(/pending|not yet persisted/i);
    expect(out).toContain("Saved to your profile");
  });

  it("refuses an incomplete pattern without writing", () => {
    const store: Record<string, string> = {};
    expect(learnPattern("", "v", 0.8, store)).toMatch(/I need both/);
    expect(learnPattern("k", "", 0.8, store)).toMatch(/I need both/);
    expect(Object.keys(store)).toHaveLength(0);
  });

  it("overwrites the same kind rather than duplicating it", () => {
    const store: Record<string, string> = {};
    learnPattern("habit:gym", "Mornings", 0.6, store);
    learnPattern("habit:gym", "Evenings", 0.9, store);
    expect(readPatterns(store)).toEqual([{ kind: "habit:gym", value: "Evenings", confidence: 0.9 }]);
  });
});

describe("getHabits", () => {
  it("reports the empty state with the threshold that was asked for", () => {
    expect(getHabits(0.7, {})).toContain("70% confidence");
  });

  it("lists habits at or above the confidence threshold", () => {
    const store: Record<string, string> = {};
    learnPattern("habit:gym", "Trains at 7am", 0.9, store);
    const out = getHabits(0.5, store);
    expect(out).toContain("Trains at 7am");
    expect(out).toContain("90%");
  });

  it("filters out habits below the threshold", () => {
    const store: Record<string, string> = {};
    learnPattern("habit:vague", "Maybe reads", 0.2, store);
    expect(getHabits(0.5, store)).toContain("Nothing recorded");
  });

  it("does not treat non-habit patterns as habits", () => {
    const store: Record<string, string> = {};
    learnPattern("preference:tea", "Oolong", 0.9, store);
    expect(getHabits(0.5, store)).toContain("Nothing recorded");
  });
});

describe("getInsights", () => {
  it("separates habits, preferences and other patterns", () => {
    const store: Record<string, string> = { name: "Anchit" };
    learnPattern("habit:gym", "Trains at 7am", 0.9, store);
    learnPattern("preference:tea", "Oolong", 0.8, store);
    learnPattern("workflow", "Ships on Fridays", 0.7, store);

    const out = getInsights("all", store);
    expect(out).toContain("Trains at 7am");
    expect(out).toContain("Oolong");
    expect(out).toContain("Ships on Fridays");
    expect(out).toContain("**name**: Anchit");
  });

  it("scopes output to the requested category", () => {
    const store: Record<string, string> = {};
    learnPattern("habit:gym", "Trains at 7am", 0.9, store);
    learnPattern("preference:tea", "Oolong", 0.8, store);

    const out = getInsights("preferences", store);
    expect(out).toContain("Oolong");
    expect(out).not.toContain("Trains at 7am");
  });

  it("does not file a habit under generic patterns", () => {
    const store: Record<string, string> = {};
    learnPattern("habit:gym", "Trains at 7am", 0.9, store);
    const patternsOnly = getInsights("patterns", store);
    expect(patternsOnly).toContain("No patterns recorded yet");
  });

  it("reports empty states rather than inventing learning", () => {
    const out = getInsights("all", {});
    expect(out).toContain("Nothing recorded yet");
    expect(out).toContain("No patterns recorded yet");
    expect(out).toContain("Nothing stored yet");
  });
});
