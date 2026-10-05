import { describe, expect, it, beforeEach } from "vitest";
import {
  DEFAULT_CONFIG,
  formatHotkey,
  loadActivation,
  matchesHotkey,
  parseHotkeyString,
  phraseTriggers,
  reservedHotkey,
  saveActivation,
  silencePeak,
} from "@/lib/activation";

describe("activation config", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("defaults when nothing is stored", () => {
    expect(loadActivation()).toEqual(DEFAULT_CONFIG);
  });

  it("round-trips a save", () => {
    saveActivation({ ...DEFAULT_CONFIG, wakeWordEnabled: false, selectedWakeWord: "Friday" });
    expect(loadActivation().wakeWordEnabled).toBe(false);
    expect(loadActivation().selectedWakeWord).toBe("Friday");
    expect(localStorage.getItem("jarvis_wakeword")).toBe("0");
  });

  it("reads a Cmd+J string from the original settings shape", () => {
    localStorage.setItem("jarvis_activation_config", JSON.stringify({
      wakeWordEnabled: true,
      selectedWakeWord: "Hey Jarvis",
      wakeWordSensitivity: 0.7,
      gestureEnabled: true,
      selectedGesture: "shake",
      hapticFeedback: true,
      keyboardShortcut: "Cmd+J",
    }));
    expect(loadActivation().hotkey).toEqual({ mod: true, alt: false, shift: false, key: "j" });
  });

  it("migrates a legacy wake-off flag", () => {
    localStorage.setItem("jarvis_wake_enabled", "false");
    expect(loadActivation().wakeWordEnabled).toBe(false);
  });
});

describe("wake phrase triggers", () => {
  it("splits Hey Jarvis", () => {
    expect(phraseTriggers("Hey Jarvis")).toEqual(expect.arrayContaining(["hey jarvis", "jarvis"]));
  });

  it("adds Edith's spelled form", () => {
    expect(phraseTriggers("Edith")).toEqual(expect.arrayContaining(["edith", "e d i t h"]));
  });
});

describe("hotkey", () => {
  it("parses Ctrl+Space", () => {
    expect(parseHotkeyString("Ctrl+Space")).toEqual({ mod: true, alt: false, shift: false, key: " " });
  });

  it("formats on Mac as Cmd", () => {
    expect(formatHotkey({ mod: true, alt: false, shift: false, key: "j" }, true)).toBe("Cmd+J");
    expect(formatHotkey({ mod: true, alt: false, shift: false, key: "j" }, false)).toBe("Ctrl+J");
  });

  it("matches meta or ctrl for a mod hotkey", () => {
    const h = { mod: true, alt: false, shift: false, key: "j" };
    expect(matchesHotkey({ key: "j", metaKey: true, ctrlKey: false, altKey: false, shiftKey: false } as KeyboardEvent, h)).toBe(true);
    expect(matchesHotkey({ key: "j", metaKey: false, ctrlKey: true, altKey: false, shiftKey: false } as KeyboardEvent, h)).toBe(true);
    expect(matchesHotkey({ key: "j", metaKey: false, ctrlKey: false, altKey: false, shiftKey: false } as KeyboardEvent, h)).toBe(false);
    expect(matchesHotkey({ key: "k", metaKey: true, ctrlKey: false, altKey: false, shiftKey: false } as KeyboardEvent, h)).toBe(false);
  });

  it("reserves Cmd+K for the command palette", () => {
    expect(reservedHotkey({ mod: true, alt: false, shift: false, key: "k" })).toBe(true);
    expect(reservedHotkey({ mod: true, alt: false, shift: false, key: "j" })).toBe(false);
  });
});

describe("mic sensitivity", () => {
  it("lowers the silence floor as sensitivity rises", () => {
    expect(silencePeak(1)).toBeLessThan(silencePeak(0.2));
    expect(silencePeak(0.7)).toBeCloseTo(0.0126, 3);
  });
});
