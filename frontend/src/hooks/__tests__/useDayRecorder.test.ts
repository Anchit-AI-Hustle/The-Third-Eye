import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useDayRecorder } from "@/hooks/useDayRecorder";

class FakeRecorder {
  static isTypeSupported = () => true;
  state = "inactive";
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;
  start() { this.state = "recording"; }
  stop() { this.state = "inactive"; void this.onstop?.(); }
}
class FakeAudioContext {
  state = "running";
  createAnalyser() { return { fftSize: 512, getByteTimeDomainData: (b: Uint8Array) => b.fill(128) }; }
  createMediaStreamSource() { return { connect: () => {} }; }
  close() { return Promise.resolve(); }
}

function setup() {
  const tracks: { onended: (() => void) | null; stop: () => void }[] = [];
  const getUserMedia = vi.fn(async () => {
    const t = { onended: null as (() => void) | null, stop: vi.fn() };
    tracks.push(t);
    return { getTracks: () => [t] };
  });
  vi.stubGlobal("navigator", { ...navigator, mediaDevices: { getUserMedia } });
  vi.stubGlobal("MediaRecorder", FakeRecorder);
  vi.stubGlobal("AudioContext", FakeAudioContext);
  return { getUserMedia, tracks };
}

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("useDayRecorder", () => {
  it("picks the mic back up by itself when it drops, until stopped", async () => {
    vi.useFakeTimers();
    const { getUserMedia, tracks } = setup();
    const { result } = renderHook(() => useDayRecorder(() => {}));
    await act(async () => { await result.current.start(); });
    expect(getUserMedia).toHaveBeenCalledTimes(1);

    await act(async () => { tracks[0].onended?.(); await vi.advanceTimersByTimeAsync(2_000); });
    expect(getUserMedia).toHaveBeenCalledTimes(2);
    expect(result.current.recording).toBe(true);

    act(() => result.current.stop());
    await act(async () => { tracks[1].onended?.(); await vi.advanceTimersByTimeAsync(60_000); });
    expect(getUserMedia).toHaveBeenCalledTimes(2);
    expect(result.current.recording).toBe(false);
  });
});
