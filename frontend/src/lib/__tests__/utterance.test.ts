import { describe, expect, it } from "vitest";
import { isRecognizerNoise } from "../utterance";

describe("isRecognizerNoise", () => {
  it("drops a scrap the recognizer invented", () => {
    expect(isRecognizerNoise("はいばい")).toBe(true);
    expect(isRecognizerNoise("a")).toBe(true);
    expect(isRecognizerNoise("  ")).toBe(true);
    expect(isRecognizerNoise("...")).toBe(true);
  });

  it("keeps a short real reply and any sentence", () => {
    expect(isRecognizerNoise("yes")).toBe(false);
    expect(isRecognizerNoise("ok")).toBe(false);
    expect(isRecognizerNoise("hi")).toBe(false);
    expect(isRecognizerNoise("bye")).toBe(false);
    expect(isRecognizerNoise("はい")).toBe(false);
    expect(isRecognizerNoise("了解")).toBe(false);
    expect(isRecognizerNoise("Hey Jarvis")).toBe(false);
    expect(isRecognizerNoise("open the dashboard")).toBe(false);
  });
});
