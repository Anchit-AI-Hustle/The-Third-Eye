import { renderHook, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useWakeWord } from "@/hooks/useWakeWord";

// ─── Test doubles ────────────────────────────────────────────────────────────

class FakeRecognition {
  static instances: FakeRecognition[] = [];
  static failNextStart = false;

  continuous = false;
  interimResults = false;
  maxAlternatives = 1;
  lang = "";
  started = false;
  aborted = false;

  onstart: (() => void) | null = null;
  onresult: ((e: unknown) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  onend: (() => void) | null = null;

  constructor() {
    FakeRecognition.instances.push(this);
  }

  start() {
    if (FakeRecognition.failNextStart) {
      FakeRecognition.failNextStart = false;
      throw new Error("already started");
    }
    this.started = true;
    this.onstart?.();
  }

  abort() {
    this.aborted = true;
    this.onend?.();
  }

  /** Deliver a final transcript the way the browser would. */
  say(text: string) {
    this.emit(text, true);
  }

  /**
   * Deliver an interim result — what the browser actually sends mid-sentence,
   * and what the hook has to hold on rather than wake from halfway through a
   * command.
   */
  sayInterim(text: string) {
    this.emit(text, false);
  }

  private emit(text: string, isFinal: boolean) {
    const result = Object.assign([{ transcript: text }], { isFinal });
    this.onresult?.({ resultIndex: 0, results: [result] });
  }

  static get latest() {
    return FakeRecognition.instances[FakeRecognition.instances.length - 1];
  }

  static reset() {
    FakeRecognition.instances = [];
    FakeRecognition.failNextStart = false;
  }
}

class FakeMediaRecorder {
  static instances: FakeMediaRecorder[] = [];
  static isTypeSupported = () => true;

  state: "inactive" | "recording" = "inactive";
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;

  constructor(public stream: unknown) {
    FakeMediaRecorder.instances.push(this);
  }

  start() {
    this.state = "recording";
  }

  stop() {
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob(["x".repeat(4000)]) });
    this.onstop?.();
  }

  static get latest() {
    return FakeMediaRecorder.instances[FakeMediaRecorder.instances.length - 1];
  }

  static reset() {
    FakeMediaRecorder.instances = [];
  }
}

const track = { stop: vi.fn() };
const fakeStream = { getTracks: () => [track] };

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => state,
  });
  document.dispatchEvent(new Event("visibilitychange"));
}

let getUserMedia: ReturnType<typeof vi.fn>;
let onWakeSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers();
  onWakeSpy = vi.fn();
  FakeRecognition.reset();
  FakeMediaRecorder.reset();
  track.stop.mockClear();

  (window as any).SpeechRecognition = FakeRecognition;
  (globalThis as any).MediaRecorder = FakeMediaRecorder;
  // Timer-driven so the loudness meter keeps sampling as the clock advances.
  // A synchronous stub would either spin forever or stop after N frames, and
  // stopping makes every recorded chunk look like silence to the gate.
  (globalThis as any).requestAnimationFrame = (cb: FrameRequestCallback) =>
    setTimeout(() => cb(0), 16) as unknown as number;
  (globalThis as any).cancelAnimationFrame = (id: number) => clearTimeout(id);

  getUserMedia = vi.fn().mockResolvedValue(fakeStream);
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia },
  });

  // AudioContext is only used for loudness gating; a stub keeps it out of the way.
  (window as any).AudioContext = class {
    createAnalyser() {
      return { fftSize: 512, getByteTimeDomainData: () => {}, connect: () => {} };
    }
    createMediaStreamSource() {
      return { connect: () => {} };
    }
    close() {
      return Promise.resolve();
    }
  };

  setVisibility("visible");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    json: () => Promise.resolve({ text: "" }),
  }));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function mount(overrides: Partial<Parameters<typeof useWakeWord>[0]> = {}) {
  const onWake = vi.fn();
  const hook = renderHook(() =>
    useWakeWord({ agentName: "JARVIS", enabled: true, onWake, ...overrides }),
  );
  return { hook, onWake };
}

// ─── Trigger matching ────────────────────────────────────────────────────────

describe("wake word detection", () => {
  it("fires on the agent name", () => {
    const { onWake } = mount();
    act(() => FakeRecognition.latest.say("jarvis what's the weather"));
    expect(onWake).toHaveBeenCalledWith("jarvis", "jarvis what's the weather");
  });

  it("is case and punctuation insensitive", () => {
    const { onWake } = mount();
    act(() => FakeRecognition.latest.say("JARVIS!"));
    expect(onWake).toHaveBeenCalled();
  });

  it("ignores speech that contains no trigger", () => {
    const { onWake } = mount();
    act(() => FakeRecognition.latest.say("just talking to someone else"));
    expect(onWake).not.toHaveBeenCalled();
  });

  it("matches a custom agent name", () => {
    const { onWake } = mount({ agentName: "FRIDAY" });
    act(() => FakeRecognition.latest.say("friday turn on the lights"));
    expect(onWake).toHaveBeenCalledWith("friday", expect.stringContaining("friday"));
  });

  it("suppresses a second fire inside the cooldown", () => {
    const { onWake } = mount({ cooldownMs: 5000 });
    act(() => FakeRecognition.latest.say("jarvis"));
    act(() => FakeRecognition.latest.say("jarvis again"));
    expect(onWake).toHaveBeenCalledTimes(1);
  });

  it("fires again once the cooldown has passed", () => {
    const { onWake } = mount({ cooldownMs: 1000 });
    act(() => FakeRecognition.latest.say("jarvis"));
    act(() => { vi.advanceTimersByTime(1500); });
    act(() => FakeRecognition.latest.say("jarvis"));
    expect(onWake).toHaveBeenCalledTimes(2);
  });
});

// ─── Commands spoken in the same breath as the name ──────────────────────────
//
// Waking on an interim result hands the microphone to the main recognizer
// mid-sentence and loses the rest of the command, so an utterance that carries
// one is held until it is complete. Bare "hey JARVIS" is not held — a delay
// there is the user watching a panel that has not opened.

describe("hearing the whole command", () => {
  it("wakes immediately on the bare name, without waiting", () => {
    const { onWake } = mount();
    act(() => FakeRecognition.latest.sayInterim("hey jarvis"));
    expect(onWake).toHaveBeenCalledWith("jarvis", "hey jarvis");
  });

  it("holds an interim that has a command attached", () => {
    const { onWake } = mount();
    act(() => FakeRecognition.latest.sayInterim("hey jarvis what's the"));
    expect(onWake).not.toHaveBeenCalled();
  });

  it("wakes with the finished sentence, not the fragment", () => {
    const { onWake } = mount();
    act(() => FakeRecognition.latest.sayInterim("hey jarvis what's the"));
    act(() => FakeRecognition.latest.say("hey jarvis what's the weather in Delhi"));
    expect(onWake).toHaveBeenCalledTimes(1);
    expect(onWake).toHaveBeenCalledWith("jarvis", "hey jarvis what's the weather in Delhi");
  });

  it("gives up waiting rather than never waking at all", () => {
    // The recognizer does not always call an utterance final.
    const { onWake } = mount();
    act(() => FakeRecognition.latest.sayInterim("hey jarvis open my tasks"));
    act(() => { vi.advanceTimersByTime(1500); });
    expect(onWake).toHaveBeenCalledWith("jarvis", "hey jarvis open my tasks");
  });

  it("does not wake twice when the final lands after the wait expired", () => {
    const { onWake } = mount({ cooldownMs: 5000 });
    act(() => FakeRecognition.latest.sayInterim("hey jarvis open my tasks"));
    act(() => { vi.advanceTimersByTime(1500); });
    act(() => FakeRecognition.latest.say("hey jarvis open my tasks"));
    expect(onWake).toHaveBeenCalledTimes(1);
  });

  it("drops a held utterance when listening is turned off", () => {
    const view = renderHook(
      ({ enabled }) => useWakeWord({ agentName: "JARVIS", enabled, onWake: onWakeSpy }),
      { initialProps: { enabled: true } },
    );
    act(() => FakeRecognition.latest.sayInterim("hey jarvis open my tasks"));
    view.rerender({ enabled: false });
    act(() => { vi.advanceTimersByTime(2000); });
    expect(onWakeSpy).not.toHaveBeenCalled();
  });
});

// ─── Staying alive ───────────────────────────────────────────────────────────

describe("keeping the recognizer alive", () => {
  it("relaunches when the recognizer ends on its own", () => {
    mount();
    const first = FakeRecognition.latest;
    act(() => { first.onend?.(); vi.advanceTimersByTime(300); });
    expect(FakeRecognition.instances.length).toBeGreaterThan(1);
  });

  it("revives a recognizer that went silent without ending", () => {
    mount();
    const before = FakeRecognition.instances.length;
    // No events for longer than the watchdog window.
    act(() => { vi.advanceTimersByTime(16_000); });
    expect(FakeRecognition.instances.length).toBeGreaterThan(before);
  });

  it("does not stack recognizers when forcing a restart", () => {
    mount();
    const first = FakeRecognition.latest;
    act(() => { vi.advanceTimersByTime(16_000); });
    // The old instance must be detached so its onend cannot spawn a rival.
    expect(first.onend).toBeNull();
  });

  it("retries when start() throws", () => {
    FakeRecognition.failNextStart = true;
    mount();
    const before = FakeRecognition.instances.length;
    act(() => { vi.advanceTimersByTime(600); });
    expect(FakeRecognition.instances.length).toBeGreaterThan(before);
  });

  it("stops entirely when permission is refused", () => {
    const { hook } = mount();
    act(() => { FakeRecognition.latest.onerror?.({ error: "not-allowed" }); });
    expect(hook.result.current.listening).toBe(false);
  });
});

// ─── Backgrounded tab ────────────────────────────────────────────────────────

describe("listening while the tab is hidden", () => {
  it("holds the microphone open for as long as it is enabled", async () => {
    mount();
    await act(async () => { await Promise.resolve(); });
    expect(getUserMedia).toHaveBeenCalled();
  });

  it("hands over to microphone chunks when the tab hides", async () => {
    const { hook } = mount();
    await act(async () => { await Promise.resolve(); });

    act(() => setVisibility("hidden"));
    expect(hook.result.current.hearingInBackground).toBe(true);
    expect(FakeMediaRecorder.instances.length).toBeGreaterThan(0);
  });

  it("keeps recording chunk after chunk while hidden", async () => {
    mount();
    await act(async () => { await Promise.resolve(); });
    act(() => setVisibility("hidden"));

    const first = FakeMediaRecorder.instances.length;
    await act(async () => {
      vi.advanceTimersByTime(6_500);
      await Promise.resolve();
    });
    expect(FakeMediaRecorder.instances.length).toBeGreaterThan(first);
  });

  it("hands back to the recognizer when the tab is shown again", async () => {
    const { hook } = mount();
    await act(async () => { await Promise.resolve(); });

    act(() => setVisibility("hidden"));
    const before = FakeRecognition.instances.length;

    act(() => setVisibility("visible"));
    expect(hook.result.current.hearingInBackground).toBe(false);
    expect(FakeRecognition.instances.length).toBeGreaterThan(before);
  });

  it("does not start the fallback when background listening is off", async () => {
    const { hook } = mount({ backgroundListening: false });
    await act(async () => { await Promise.resolve(); });

    act(() => setVisibility("hidden"));
    expect(hook.result.current.hearingInBackground).toBe(false);
    expect(FakeMediaRecorder.instances.length).toBe(0);
  });

  it("fires the wake word from a transcribed background chunk", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ text: "jarvis remind me later" }),
    }));

    const { onWake } = mount();
    await act(async () => { await Promise.resolve(); });
    act(() => setVisibility("hidden"));

    await act(async () => {
      vi.advanceTimersByTime(6_500);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(onWake).toHaveBeenCalledWith("jarvis", "jarvis remind me later");
  });

  it("survives a failed transcription without stopping the loop", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    mount();
    await act(async () => { await Promise.resolve(); });
    act(() => setVisibility("hidden"));

    const before = FakeMediaRecorder.instances.length;
    await act(async () => {
      vi.advanceTimersByTime(6_500);
      await Promise.resolve();
    });
    expect(FakeMediaRecorder.instances.length).toBeGreaterThan(before);
  });
});

// ─── Teardown ────────────────────────────────────────────────────────────────

describe("teardown", () => {
  it("releases the microphone when disabled", async () => {
    const view = renderHook(
      ({ enabled }) => useWakeWord({ agentName: "JARVIS", enabled, onWake: vi.fn() }),
      { initialProps: { enabled: true } },
    );
    await act(async () => { await Promise.resolve(); });

    view.rerender({ enabled: false });
    expect(track.stop).toHaveBeenCalled();
  });

  it("reports unsupported when the browser has no SpeechRecognition", () => {
    delete (window as any).SpeechRecognition;
    delete (window as any).webkitSpeechRecognition;
    const { hook } = mount();
    expect(hook.result.current.supported).toBe(false);
  });
});
