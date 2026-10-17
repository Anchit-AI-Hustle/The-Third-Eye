import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useVoiceSTT } from "@/hooks/useVoice";

describe("useVoiceSTT on an iPhone home-screen app", () => {
  it("opens the audio context inside the tap, before waiting for the microphone", async () => {
    const order: string[] = [];
    let grant: (s: MediaStream) => void = () => {};
    class Ctx {
      state = "suspended";
      constructor() { order.push("AudioContext"); }
      resume() { order.push("resume"); return Promise.resolve(); }
      close() { return Promise.resolve(); }
      createMediaStreamSource() { return { connect() {} }; }
      createAnalyser() { return { fftSize: 512, getByteTimeDomainData() {} }; }
    }
    vi.stubGlobal("AudioContext", Ctx);
    vi.stubGlobal("navigator", {
      ...navigator,
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)",
      standalone: true,
      mediaDevices: { getUserMedia: () => { order.push("getUserMedia"); return new Promise((r) => { grant = r; }); } },
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 200 })));
    const { result } = renderHook(() => useVoiceSTT({ onTranscript: () => {} }));
    let done: Promise<void> = Promise.resolve();
    act(() => { done = result.current.enable(); });
    expect(order).toEqual(["AudioContext", "resume", "getUserMedia"]);
    await act(async () => { grant({ getTracks: () => [], getAudioTracks: () => [] } as unknown as MediaStream); await done; });
    result.current.disable();
    vi.unstubAllGlobals();
  });
});
