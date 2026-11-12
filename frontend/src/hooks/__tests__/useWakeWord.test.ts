import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const captureMocks = vi.hoisted(() => ({
  options: null as null | { onSegment: (audio: Blob) => void; onError?: (error: unknown) => void },
  stop: vi.fn(),
  text: "",
}));

vi.mock("@/lib/speechCapture", () => ({
  startSpeechCapture: vi.fn(async (options) => {
    captureMocks.options = options;
    return { stop: captureMocks.stop };
  }),
  transcribeSpeechSegment: vi.fn(async () => captureMocks.text),
}));

import { startSpeechCapture, transcribeSpeechSegment } from "@/lib/speechCapture";
import { buildTriggerSet, isNameTrigger, matchTrigger, stripWakeTrigger, useWakeWord } from "@/hooks/useWakeWord";

beforeEach(() => {
  vi.clearAllMocks();
  captureMocks.options = null;
  captureMocks.text = "";
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia: vi.fn() },
  });
  (window as any).AudioContext = class {};
});

describe("wake trigger matching", () => {
  it("matches normalized and compact agent names", () => {
    const triggers = buildTriggerSet("E.D.I.T.H.");
    expect(matchTrigger("hello edith, are you there", triggers)).toBe("edith");
    expect(isNameTrigger("e d i t h", "E.D.I.T.H.")).toBe(true);
  });

  it("extracts a command spoken with the wake name and ignores incidental mentions", () => {
    expect(stripWakeTrigger("hey jarvis open my calendar", "jarvis")).toBe("open my calendar");
    expect(stripWakeTrigger("next friday can you send this", "friday")).toBe("");
  });
});

describe("gated wake capture", () => {
  it("starts PCM speech capture and sends only completed segments to transcription", async () => {
    const onWake = vi.fn();
    renderHook(() => useWakeWord({ agentName: "JARVIS", enabled: true, onWake }));
    await act(async () => { await Promise.resolve(); });
    expect(startSpeechCapture).toHaveBeenCalledWith(expect.objectContaining({ onSegment: expect.any(Function) }));

    captureMocks.text = "jarvis remind me later";
    await act(async () => {
      captureMocks.options?.onSegment(new Blob([new Uint8Array(2000)]));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(transcribeSpeechSegment).toHaveBeenCalledTimes(1);
    expect(onWake).toHaveBeenCalledWith("jarvis", "jarvis remind me later");
  });

  it("ignores empty transcription and keeps listening after a request failure", async () => {
    const onWake = vi.fn();
    renderHook(() => useWakeWord({ agentName: "JARVIS", enabled: true, onWake }));
    await act(async () => { await Promise.resolve(); });
    captureMocks.text = "";
    await act(async () => {
      captureMocks.options?.onSegment(new Blob([new Uint8Array(2000)]));
      await Promise.resolve();
    });
    expect(onWake).not.toHaveBeenCalled();
    expect(startSpeechCapture).toHaveBeenCalledTimes(1);
  });

  it("stops capture when disabled", async () => {
    const view = renderHook(({ enabled }) => useWakeWord({ agentName: "JARVIS", enabled, onWake: vi.fn() }), {
      initialProps: { enabled: true },
    });
    await act(async () => { await Promise.resolve(); });
    view.rerender({ enabled: false });
    expect(captureMocks.stop).toHaveBeenCalled();
  });
});
