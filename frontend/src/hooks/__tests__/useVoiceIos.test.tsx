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

  it("sends each spoken phrase as 16 kHz WAV, including the moment before speech started", async () => {
    let level = 0;
    let tap: { onaudioprocess: ((e: unknown) => void) | null } | null = null;
    class Ctx {
      state = "running";
      sampleRate = 48000;
      destination = {};
      resume() { return Promise.resolve(); }
      close() { return Promise.resolve(); }
      createMediaStreamSource() { return { connect() {} }; }
      createAnalyser() {
        return { fftSize: 512, context: this, connect() {}, disconnect() {},
          getByteTimeDomainData(a: Uint8Array) { a.fill(128); a[0] = 128 + level; } };
      }
      createScriptProcessor() { tap = { onaudioprocess: null }; return Object.assign(tap, { connect() {}, disconnect() {} }); }
    }
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => { frames.push(cb); return frames.length; });
    vi.stubGlobal("cancelAnimationFrame", () => {});
    vi.stubGlobal("AudioContext", Ctx);
    vi.stubGlobal("navigator", {
      ...navigator,
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)",
      standalone: true,
      language: "en-IN",
      mediaDevices: { getUserMedia: async () => ({ getTracks: () => [], getAudioTracks: () => [] }) },
    });
    const sent: FormData[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.body instanceof FormData && init.body.get("audio")) sent.push(init.body);
      return Response.json({ text: "remind me to call mom" });
    }));
    let now = 1_000_000;
    const clock = vi.spyOn(Date, "now").mockImplementation(() => now);
    const heard: string[] = [];
    const { result } = renderHook(() => useVoiceSTT({ onTranscript: (t) => heard.push(t) }));
    await act(async () => { await result.current.enable(); });

    const chunk = () => tap!.onaudioprocess!({ inputBuffer: { getChannelData: () => new Float32Array(4800).fill(0.3) } });
    const frame = () => { for (const cb of frames.splice(0)) cb(0); now += 17; };
    now += 5000;                                    // well after any browser-recognizer result
    for (let i = 0; i < 30; i++) frame();          // quiet room
    for (let i = 0; i < 10; i++) chunk();           // 1 s of audio before speech is detected
    level = 60;
    for (let i = 0; i < 30; i++) frame();           // speaking
    for (let i = 0; i < 5; i++) chunk();            // 0.5 s while speaking
    level = 0;
    for (let i = 0; i < 80; i++) frame();           // 1.3 s of quiet ends the phrase
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

    expect(sent).toHaveLength(1);
    const audio = sent[0].get("audio") as File;
    expect(audio.name).toBe("speech.wav");
    expect(audio.type).toBe("audio/wav");
    expect(audio.size).toBe(44 + 2 * (0.5 + 0.5) * 16000);
    expect(sent[0].get("lang")).toBe("en-IN");
    expect(heard).toEqual(["remind me to call mom"]);

    clock.mockRestore();
    result.current.disable();
    vi.unstubAllGlobals();
  });
});

