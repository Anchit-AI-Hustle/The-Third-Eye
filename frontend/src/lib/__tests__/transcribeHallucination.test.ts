import { describe, expect, it } from "vitest";
import { isHallucination, spokenText } from "@/lib/llmCascade";

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

describe("spokenText", () => {
  it("keeps what Whisper scored as speech", () => {
    expect(spokenText({
      text: " Remind me to call mom at six.",
      segments: [{ text: " Remind me to call mom at six.", no_speech_prob: 0.02, avg_logprob: -0.2, compression_ratio: 1.1 }],
    })).toBe("Remind me to call mom at six.");
  });

  it("drops a segment Whisper itself judged silent and was unsure of", () => {
    expect(spokenText({
      segments: [
        { text: " Add milk to the list.", no_speech_prob: 0.05, avg_logprob: -0.25, compression_ratio: 1.2 },
        { text: " Thank you for watching.", no_speech_prob: 0.82, avg_logprob: -1.1, compression_ratio: 1.0 },
      ],
    })).toBe("Add milk to the list.");
  });

  it("keeps a quiet but confident segment", () => {
    expect(spokenText({ segments: [{ text: " Yes.", no_speech_prob: 0.7, avg_logprob: -0.3, compression_ratio: 0.8 }] })).toBe("Yes.");
  });

  it("drops a decoding loop", () => {
    expect(spokenText({ segments: [{ text: " the the the the the the the the", no_speech_prob: 0.1, avg_logprob: -0.4, compression_ratio: 3.1 }] })).toBe("");
  });

  it("falls back to the text when there are no segments", () => {
    expect(spokenText({ text: " Hello there " })).toBe("Hello there");
  });
});
