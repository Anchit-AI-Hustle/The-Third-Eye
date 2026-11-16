import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const capture = vi.hoisted(() => ({ options: [] as any[], stops: 0 }));
vi.mock("@/lib/speechCapture", () => ({
  startSpeechCapture: vi.fn(async (options) => {
    capture.options.push(options);
    return { stop: () => { capture.stops++; } };
  }),
  transcribeSpeechSegment: vi.fn(async () => "hello there"),
}));
vi.mock("@/lib/lifelog/audioStore", () => ({ putAudio: vi.fn(async () => true) }));

import { useDayRecorder } from "@/hooks/useDayRecorder";
import { startSpeechCapture, transcribeSpeechSegment } from "@/lib/speechCapture";

beforeEach(() => {
  vi.clearAllMocks();
  capture.options = [];
  capture.stops = 0;
});

describe("useDayRecorder", () => {
  it("stores and transcribes only gated speech segments", async () => {
    const onSegment = vi.fn();
    const { result } = renderHook(() => useDayRecorder(onSegment));
    await act(async () => { await result.current.start(); });
    expect(result.current.recording).toBe(true);
    expect(startSpeechCapture).toHaveBeenCalledTimes(1);

    await act(async () => {
      await capture.options[0].onSegment(new Blob([new Uint8Array(1500)]));
    });
    expect(transcribeSpeechSegment).toHaveBeenCalledTimes(1);
    expect(onSegment).toHaveBeenCalledWith(expect.objectContaining({ transcript: "hello there", hasAudio: true }));
  });

  it("reopens capture after a microphone track ends and stops cleanly", async () => {
    const { result } = renderHook(() => useDayRecorder(() => {}));
    await act(async () => { await result.current.start(); });
    await act(async () => { capture.options[0].onTrackEnded(); await Promise.resolve(); });
    expect(startSpeechCapture).toHaveBeenCalledTimes(2);
    act(() => result.current.stop());
    expect(capture.stops).toBe(1);
    expect(result.current.recording).toBe(false);
  });
});
