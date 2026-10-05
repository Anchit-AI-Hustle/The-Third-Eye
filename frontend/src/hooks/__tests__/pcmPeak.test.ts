import { describe, expect, it } from "vitest";
import { pcmPeak } from "../useVoice";

describe("pcmPeak", () => {
  it("is zero for silence", () => {
    expect(pcmPeak(new Uint8Array([128, 128, 128]))).toBe(0);
  });

  it("reads the loudest sample, so a quiet voice still crosses the speech gate", () => {
    // 131 is (131-128)/128 ≈ 0.023, above the recorder's 0.02 onset.
    // An FFT-bin average of the same clip stays under the old level gate and
    // never starts a recording.
    expect(pcmPeak(new Uint8Array([128, 128, 131]))).toBeGreaterThan(0.02);
  });
});
