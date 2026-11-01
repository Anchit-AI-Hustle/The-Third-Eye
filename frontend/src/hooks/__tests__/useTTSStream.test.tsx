import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useTTS } from "@/hooks/useVoice";

class Utterance { onstart?: () => void; onend?: () => void; onerror?: () => void; constructor(public text: string) {} }

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

function stubSynth() {
  const spoken: Utterance[] = [];
  const synth = {
    speaking: false,
    getVoices: () => [{ name: "Daniel", lang: "en-GB" }],
    addEventListener() {}, removeEventListener() {},
    cancel() {}, resume() {}, pause() {},
    speak(u: Utterance) { spoken.push(u); u.onstart?.(); },
  };
  vi.stubGlobal("speechSynthesis", synth);
  vi.stubGlobal("SpeechSynthesisUtterance", Utterance);
  Object.defineProperty(window, "speechSynthesis", { value: synth, configurable: true });
  return spoken;
}

describe("a reply spoken while it streams", () => {
  it("starts on the first sentence, plays the rest in order and stays speaking between them", async () => {
    vi.useFakeTimers();
    const spoken = stubSynth();
    const { result } = renderHook(() => useTTS());
    const done = vi.fn();

    await act(async () => {
      expect(result.current.begin(done, true)).toBe(true);
      result.current.add("Sure, adding it now.");
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(spoken.map((u) => u.text)).toEqual(["Sure, adding it now."]);
    expect(result.current.speaking).toBe(true);

    // The first sentence ends before the next has streamed in: still one reply.
    await act(async () => { spoken[0].onend?.(); await vi.advanceTimersByTimeAsync(10); });
    expect(result.current.speaking).toBe(true);
    expect(done).not.toHaveBeenCalled();

    await act(async () => {
      result.current.add("Milk is on your list.");
      result.current.end();
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(spoken.map((u) => u.text)).toEqual(["Sure, adding it now.", "Milk is on your list."]);
    await act(async () => { spoken[1].onend?.(); await vi.advanceTimersByTimeAsync(10); });
    expect(result.current.speaking).toBe(false);
    expect(done).toHaveBeenCalledTimes(1);
  });

  it("stops the whole reply, queued sentences included", async () => {
    vi.useFakeTimers();
    const spoken = stubSynth();
    const { result } = renderHook(() => useTTS());
    await act(async () => {
      result.current.begin(undefined, true);
      result.current.add("One.");
      result.current.add("Two.");
      await vi.advanceTimersByTimeAsync(10);
    });
    await act(async () => { result.current.stop(); spoken[0].onend?.(); await vi.advanceTimersByTimeAsync(10); });
    expect(spoken.map((u) => u.text)).toEqual(["One."]);
    expect(result.current.speaking).toBe(false);
  });

  it("says nothing when voice is off and the reply isn't forced", () => {
    stubSynth();
    const { result } = renderHook(() => useTTS());
    expect(result.current.begin()).toBe(false);
  });
});
