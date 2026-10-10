import { describe, expect, it } from "vitest";
import { isHallucination } from "@/lib/llmCascade";

describe("Whisper noise hallucinations", () => {
  it("drops the phrases Whisper invents from silence and room noise", () => {
    for (const t of ["Thank you.", "thank you", " Thanks for watching! ", "You", "Bye.", ""]) {
      expect(isHallucination(t)).toBe(true);
    }
  });

  it("keeps real requests, including ones that contain those words", () => {
    for (const t of ["Thank you, now email Priya the report", "Send the Q3 report by Friday", "okay send it"]) {
      expect(isHallucination(t)).toBe(false);
    }
  });
});
