import { describe, expect, it } from "vitest";
import { sharedMessage } from "@/lib/share";

describe("something shared to The Third Eye from another app", () => {
  it("asks the assistant to save it as a note and say what it is", () => {
    expect(sharedMessage({ title: "Great article", text: "Worth reading", url: "https://example.com/a" })).toBe(
      "I shared this with you. Save it as a note, then tell me in one line what it is.\n\nGreat article\nWorth reading\nhttps://example.com/a",
    );
  });

  it("does not repeat a link the text already contains, and skips empty parts", () => {
    expect(sharedMessage({ text: "Look https://example.com/a", url: "https://example.com/a" })).toBe(
      "I shared this with you. Save it as a note, then tell me in one line what it is.\n\nLook https://example.com/a",
    );
  });

  it("returns nothing when nothing was shared", () => {
    expect(sharedMessage({ title: " ", text: "" })).toBeNull();
  });

  it("caps very long shares", () => {
    expect(sharedMessage({ text: "x".repeat(10_000) })!.length).toBeLessThan(4100);
  });
});
