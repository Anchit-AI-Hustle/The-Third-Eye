import { describe, it, expect } from "vitest";
import { changedEntries } from "@/lib/memoryStore";

describe("changedEntries", () => {
  it("writes nothing when the turn changed nothing", () => {
    const store = { name: "Anchit", city: "Delhi" };
    expect(changedEntries(store, { ...store })).toEqual([]);
  });

  it("picks up a new key", () => {
    expect(changedEntries({ a: "1" }, { a: "1", b: "2" })).toEqual([["b", "2"]]);
  });

  it("picks up an updated value", () => {
    expect(changedEntries({ a: "1" }, { a: "2" })).toEqual([["a", "2"]]);
  });

  it("does not treat a removed key as a change", () => {
    expect(changedEntries({ a: "1", b: "2" }, { a: "1" })).toEqual([]);
  });

  it("writes everything when there was nothing before", () => {
    expect(changedEntries({}, { a: "1", b: "2" })).toEqual([
      ["a", "1"],
      ["b", "2"],
    ]);
  });

  it("skips non-string values rather than writing them to a text column", () => {
    const after = { a: "1", bad: undefined as unknown as string, worse: 5 as unknown as string };
    expect(changedEntries({}, after)).toEqual([["a", "1"]]);
  });

  it("keeps an empty string, which is a legitimate value", () => {
    expect(changedEntries({ a: "1" }, { a: "" })).toEqual([["a", ""]]);
  });
});
