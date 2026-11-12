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

    // The stream behind the cut-off reply keeps arriving; none of it is spoken.
    await act(async () => { result.current.add("Three."); result.current.end(); await vi.advanceTimersByTimeAsync(10); });
    expect(spoken.map((u) => u.text)).toEqual(["One."]);
    expect(result.current.speaking).toBe(false);
  });

  it("says nothing when voice is off and the reply isn't forced", () => {
    stubSynth();
    const { result } = renderHook(() => useTTS());
    expect(result.current.begin()).toBe(false);
  });
});

describe("choosing a human voice", () => {
  const v = (name: string, lang = "en-US", localService = true) => ({ name, lang, localService }) as SpeechSynthesisVoice;

  it("prefers neural, network and Siri voices over the old robotic ones", async () => {
    const { humanVoice } = await import("@/hooks/useVoice");
    const voices = [v("Microsoft David - English (United States)"), v("Microsoft Aria Online (Natural) - English (United States)", "en-US", false), v("Fred")];
    expect(humanVoice(voices, undefined, "en-US")?.name).toMatch(/Aria Online \(Natural\)/);
    expect(humanVoice([v("Microsoft Zira Desktop"), v("Samantha"), v("Google US English", "en-US", false)], undefined, "en-US")?.name).toBe("Google US English");
    expect(humanVoice([v("Daniel (Enhanced)", "en-GB"), v("Daniel", "en-GB")], undefined, "en-GB")?.name).toBe("Daniel (Enhanced)");
  });

  it("speaks the user's language, and keeps the agent's chosen voice", async () => {
    const { humanVoice } = await import("@/hooks/useVoice");
    const voices = [v("Google US English", "en-US", false), v("Google हिन्दी", "hi-IN", false), v("Lekha", "hi-IN")];
    expect(humanVoice(voices, undefined, "hi-IN")?.name).toBe("Google हिन्दी");
    expect(humanVoice(voices, "lekha", "hi-IN")?.name).toBe("Lekha");
  });
});

describe("humanVoice for the selected assistant", () => {
  const v = (name: string, lang = "en-GB") => ({ name, lang, localService: true } as SpeechSynthesisVoice);
  it("takes the preference in its own order, skips a broken pattern, and keeps the gender", async () => {
    const { humanVoice } = await import("@/hooks/useVoice");
    expect(humanVoice([v("Oliver"), v("Daniel")], "daniel|oliver", "en-GB")?.name).toBe("Daniel");
    expect(humanVoice([v("Daniel")], "(|daniel", "en-GB")?.name).toBe("Daniel");
    expect(humanVoice([v("Google UK English Male"), v("Google UK English Female")], "nobody", "en-GB", "female")?.name).toBe("Google UK English Female");
  });
});
