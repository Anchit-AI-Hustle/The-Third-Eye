import { describe, expect, it } from "vitest";
import { composeTrack, parseKey, renderWav, SAMPLE_RATE, specFromText } from "@/lib/music/synth";

const pcm = (wav: Uint8Array) => new Int16Array(wav.buffer, wav.byteOffset + 44, (wav.length - 44) / 2);
const ascii = (wav: Uint8Array, at: number) => String.fromCharCode(...wav.subarray(at, at + 4));

describe("code-composed music", () => {
  it("reads the key, and a sad or dark mood makes it minor", () => {
    expect(parseKey("F# minor")).toEqual({ root: 6, minor: true });
    expect(parseKey("Bb")).toEqual({ root: 10, minor: false });
    expect(parseKey(undefined, ["sad", "rainy"]).minor).toBe(true);
    expect(parseKey(undefined, ["happy"]).minor).toBe(false);
  });

  it("is the same song for the same request and a different one for another", () => {
    const spec = { bpm: 120, seconds: 20, energy: 6, seed: "lofi study" };
    expect(composeTrack(spec)).toEqual(composeTrack(spec));
    expect(composeTrack({ ...spec, seed: "beach party" })).not.toEqual(composeTrack(spec));
  });

  it("keeps the beat: kicks land on the tempo and nothing plays past the end", () => {
    const { events } = composeTrack({ bpm: 120, seconds: 16, energy: 7, seed: "x" });
    const kicks = events.filter((e) => e.kind === "kick");
    expect(kicks.length).toBe(32); // four on the floor at energy >= 6
    for (const k of kicks) expect((k.t / 0.5) % 1).toBeCloseTo(0, 6);
    expect(Math.max(...events.map((e) => e.t))).toBeLessThan(16);
    expect(new Set(events.map((e) => e.kind))).toEqual(new Set(["pad", "bass", "arp", "kick", "snare", "hat"]));
  });

  it("calm music drops the drums back", () => {
    const kinds = new Set(composeTrack({ bpm: 70, seconds: 16, energy: 2, seed: "x" }).events.map((e) => e.kind));
    expect(kinds.has("hat")).toBe(false);
    expect(kinds.has("snare")).toBe(false);
  });

  it("renders a playable, audible WAV of the asked length", () => {
    const wav = renderWav({ bpm: 100, seconds: 12, energy: 5, seed: "demo" });
    expect(ascii(wav, 0)).toBe("RIFF");
    expect(ascii(wav, 8)).toBe("WAVE");
    const view = new DataView(wav.buffer, wav.byteOffset);
    expect(view.getUint32(24, true)).toBe(SAMPLE_RATE);
    expect(view.getUint16(22, true)).toBe(1);
    const s = pcm(wav);
    expect(s.length / SAMPLE_RATE).toBeCloseTo(12, 1);
    let sum = 0, peak = 0;
    for (const v of s) { sum += v * v; peak = Math.max(peak, Math.abs(v)); }
    expect(Math.sqrt(sum / s.length) / 32768).toBeGreaterThan(0.02);
    expect(peak).toBeLessThan(32768);
  });

  it("renders a minute quickly enough to do inside a request", () => {
    const t = Date.now();
    renderWav({ bpm: 128, seconds: 60, energy: 8, seed: "speed" });
    expect(Date.now() - t).toBeLessThan(5000);
  });

  it("reads tempo, energy, key and mood from a plain request", () => {
    expect(specFromText("chill lofi beat at 80 bpm in A minor", 30)).toMatchObject({ bpm: 80, energy: 3, key: "A minor", seconds: 30 });
    expect(specFromText("upbeat dance track for a party", 20)).toMatchObject({ bpm: 124, energy: 8 });
    expect(specFromText("something nice", 15)).toMatchObject({ bpm: 100, energy: 5 });
  });
});
