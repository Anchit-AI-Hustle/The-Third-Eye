import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useTTS } from "@/hooks/useVoice";

class Utterance { onstart?: () => void; onend?: () => void; onerror?: () => void; constructor(public text: string) {} }

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

function stubSynth(behaviour: "silent" | "starts-never-ends") {
  const synth = {
    speaking: false,
    getVoices: () => [{ name: "Daniel", lang: "en-GB" }],
    addEventListener() {}, removeEventListener() {},
    cancel() {}, resume() {}, pause() {},
    speak(u: Utterance) { if (behaviour === "starts-never-ends") u.onstart?.(); },
  };
  vi.stubGlobal("speechSynthesis", synth);
  vi.stubGlobal("SpeechSynthesisUtterance", Utterance);
  Object.defineProperty(window, "speechSynthesis", { value: synth, configurable: true });
}

describe("spoken replies on iPhone", () => {
  it("frees the mic when iOS drops the reply without ever starting it", async () => {
    vi.useFakeTimers();
    stubSynth("silent");
    const { result } = renderHook(() => useTTS());
    const done = vi.fn();
    await act(async () => { void result.current.speak("Here is your briefing for today.", done, true); await vi.advanceTimersByTimeAsync(100); });
    await act(async () => { await vi.advanceTimersByTimeAsync(4000); });
    expect(done).toHaveBeenCalledTimes(1);
    expect(result.current.speaking).toBe(false);
  });

  it("frees the mic when a started reply never reports that it ended", async () => {
    vi.useFakeTimers();
    stubSynth("starts-never-ends");
    const { result } = renderHook(() => useTTS());
    const done = vi.fn();
    await act(async () => { void result.current.speak("Short reply.", done, true); await vi.advanceTimersByTimeAsync(100); });
    expect(result.current.speaking).toBe(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(3500); });
    expect(done).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(4500); });
    expect(done).toHaveBeenCalledTimes(1);
    expect(result.current.speaking).toBe(false);
  });
});
