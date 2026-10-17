// Raw microphone audio for transcription. A MediaRecorder started when speech
// is detected clips the first word (it takes a moment to start, longest on
// iPhone) and phone codecs compress speech hard. Instead the mic's samples are
// kept in a short rolling pre-roll, a phrase is captured as-is, and it is sent
// as 16 kHz mono WAV, which Whisper transcribes best.

export const TARGET_RATE = 16000;

export class PcmClip {
  private pre: Float32Array[] = [];
  private preLen = 0;
  private parts: Float32Array[] = [];
  recording = false;

  constructor(readonly rate: number, private readonly preRoll: number) {}

  push(chunk: Float32Array) {
    if (this.recording) { this.parts.push(chunk); return; }
    this.pre.push(chunk);
    this.preLen += chunk.length;
    while (this.pre.length > 1 && this.preLen - this.pre[0].length >= this.preRoll) this.preLen -= this.pre.shift()!.length;
  }

  start() {
    const all = concat(this.pre);
    this.parts = [all.subarray(Math.max(0, all.length - this.preRoll))];
    this.pre = [];
    this.preLen = 0;
    this.recording = true;
  }

  stop(): Float32Array {
    const out = concat(this.parts);
    this.parts = [];
    this.recording = false;
    return out;
  }

  drop() {
    this.parts = [];
    this.recording = false;
  }
}

function concat(chunks: Float32Array[]): Float32Array {
  const out = new Float32Array(chunks.reduce((n, c) => n + c.length, 0));
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}

/** Averages each output sample over its input span, which also low-passes. */
export function downsample(input: Float32Array, from: number, to: number): Float32Array {
  if (from === to) return input;
  const ratio = from / to;
  const out = new Float32Array(Math.floor(input.length / ratio));
  for (let i = 0; i < out.length; i++) {
    const a = Math.floor(i * ratio), b = Math.min(input.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let j = a; j < b; j++) sum += input[j];
    out[i] = sum / Math.max(1, b - a);
  }
  return out;
}

export function encodeWav(samples: Float32Array, rate: number): Blob {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, "RIFF"); v.setUint32(4, 36 + samples.length * 2, true); str(8, "WAVE");
  str(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, "data"); v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buf], { type: "audio/wav" });
}
