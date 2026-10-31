import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useVoiceSTT } from "@/hooks/useVoice";

describe("call mode while the assistant is speaking", () => {
  it("doesn't take the browser recognizer hearing the assistant's own voice as the user starting to talk", async () => {
    const recs: { onspeechstart?: () => void; start(): void; stop(): void; abort(): void }[] = [];
    class Rec { constructor() { recs.push(this as never); } start() {} stop() {} abort() {} }
    class Ctx {
      state = "running";
      resume() { return Promise.resolve(); }
      close() { return Promise.resolve(); }
      createMediaStreamSource() { return { connect() {} }; }
      createAnalyser() { return { fftSize: 512, context: this, connect() {}, getByteTimeDomainData() {} }; }
    }
    vi.stubGlobal("SpeechRecognition", Rec);
    vi.stubGlobal("AudioContext", Ctx);
    vi.stubGlobal("requestAnimationFrame", () => 1);
    vi.stubGlobal("cancelAnimationFrame", () => {});
    vi.stubGlobal("navigator", { ...navigator, mediaDevices: { getUserMedia: async () => ({ getTracks: () => [], getAudioTracks: () => [] }) } });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 200 })));
    let speaking = true;
    const onSpeechStart = vi.fn();
    const { result } = renderHook(() => useVoiceSTT({ onTranscript: () => {}, onSpeechStart, shouldSuppress: () => speaking }));
    await act(async () => { await result.current.enable(); });
    const rec = recs.at(-1)!;

    act(() => rec.onspeechstart?.());
    expect(onSpeechStart).not.toHaveBeenCalled();

    speaking = false;
    act(() => rec.onspeechstart?.());
    expect(onSpeechStart).toHaveBeenCalledTimes(1);
    result.current.disable();
    vi.unstubAllGlobals();
  });
});
