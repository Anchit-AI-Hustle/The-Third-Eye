import { afterEach, describe, expect, it, vi } from "vitest";
import { loadNaturalVoice, resetNaturalVoice, speakNatural, splitSentences } from "@/lib/naturalVoice";

afterEach(() => { resetNaturalVoice(); vi.unstubAllGlobals(); });

describe("splitSentences", () => {
  it("breaks a reply into sentences so the first one plays while the rest render", () => {
    expect(splitSentences("Good morning. You have 3 meetings! Shall I list them?")).toEqual(["Good morning.", "You have 3 meetings!", "Shall I list them?"]);
  });
  it("keeps decimals and short fragments together", () => {
    expect(splitSentences("It is 23.5 degrees. Ok.")).toEqual(["It is 23.5 degrees. Ok."]);
  });
  it("caps very long sentences", () => {
    expect(splitSentences("word ".repeat(200)).every((s) => s.length <= 400)).toBe(true);
  });
});

describe("natural voice falls back instead of going silent", () => {
  it("returns false when the browser has no WebGPU, without downloading anything", async () => {
    const importer = vi.fn();
    vi.stubGlobal("navigator", {});
    expect(await loadNaturalVoice(importer)).toBeNull();
    expect(importer).not.toHaveBeenCalled();
    expect(await speakNatural("Hello there.", {})).toBe(false);
  });

  it("returns false when the engine can't load, and stops trying", async () => {
    vi.stubGlobal("navigator", { gpu: {} });
    const importer = vi.fn().mockRejectedValue(new Error("blocked"));
    expect(await loadNaturalVoice(importer)).toBeNull();
    expect(await loadNaturalVoice(importer)).toBeNull();
    expect(importer).toHaveBeenCalledTimes(1);
    expect(await speakNatural("Hello there.", {})).toBe(false);
  });

  it("returns false when the phone blocks audio playback, so the system voice speaks instead", async () => {
    vi.stubGlobal("navigator", { gpu: {} });
    const importer = vi.fn().mockResolvedValue({ KokoroTTS: { from_pretrained: async () => ({ generate: async () => ({ toBlob: () => new Blob(["x"]) }) }) } });
    await loadNaturalVoice(importer);
    vi.stubGlobal("URL", { ...URL, createObjectURL: () => "blob:x", revokeObjectURL: () => {} });
    vi.stubGlobal("Audio", class { volume = 1; onended: unknown; onerror: unknown; play() { return Promise.reject(new DOMException("blocked", "NotAllowedError")); } pause() {} });
    const onStart = vi.fn();
    expect(await speakNatural("Hello there, how are you today?", { onStart })).toBe(false);
    expect(onStart).not.toHaveBeenCalled();
  });
});

