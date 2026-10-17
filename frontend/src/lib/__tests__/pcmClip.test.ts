import { describe, expect, it } from "vitest";
import { downsample, encodeWav, PcmClip } from "@/lib/pcmClip";

describe("speech clips for transcription", () => {
  it("writes 16-bit mono WAV that Whisper reads", async () => {
    const wav = encodeWav(new Float32Array([0, 0.5, -0.5, 1]), 16000);
    expect(wav.type).toBe("audio/wav");
    const v = new DataView(await wav.arrayBuffer());
    const tag = (o: number) => String.fromCharCode(...[0, 1, 2, 3].map((i) => v.getUint8(o + i)));
    expect(tag(0)).toBe("RIFF");
    expect(tag(8)).toBe("WAVE");
    expect(v.getUint16(22, true)).toBe(1);
    expect(v.getUint32(24, true)).toBe(16000);
    expect(v.getUint16(34, true)).toBe(16);
    expect(v.getUint32(40, true)).toBe(8);
    expect(v.getInt16(46, true)).toBe(16383);
    expect(v.getInt16(50, true)).toBe(32767);
  });

  it("downsamples the microphone rate to 16 kHz", () => {
    const out = downsample(new Float32Array(48000).fill(0.25), 48000, 16000);
    expect(out.length).toBe(16000);
    expect(out[100]).toBeCloseTo(0.25);
    expect(downsample(new Float32Array(10), 16000, 16000).length).toBe(10);
  });

  it("keeps the half second before speech so the first word is not clipped", () => {
    const clip = new PcmClip(1000, 500);
    clip.push(new Float32Array(400).fill(0.1));
    clip.push(new Float32Array(400).fill(0.2));
    expect(clip.recording).toBe(false);
    clip.start();
    clip.push(new Float32Array(300).fill(0.3));
    const audio = clip.stop();
    expect(audio.length).toBe(500 + 300);
    expect(audio[0]).toBeCloseTo(0.1);
    expect(audio[799]).toBeCloseTo(0.3);
    expect(clip.recording).toBe(false);
  });
});
