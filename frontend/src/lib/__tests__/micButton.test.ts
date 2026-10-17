import { describe, expect, it } from "vitest";
import { micButton } from "@/lib/micButton";

describe("the composer mic button", () => {
  it("shows the mic live in call mode, where it is listening", () => {
    expect(micButton(true, "call")).toEqual({ live: true, title: "Listening - tap to end the call", tone: "call" });
  });
  it("shows dictation live while dictating", () => {
    expect(micButton(true, "dictate")).toEqual({ live: true, title: "Stop dictation", tone: "dictate" });
  });
  it("is off, and offers dictation, when the mic is off", () => {
    expect(micButton(false, "call")).toEqual({ live: false, title: "Dictate - speech fills the box, doesn't send", tone: "off" });
  });
});
