// Music made entirely in code: a seeded arrangement (chords, bass, arpeggio,
// drums) rendered sample by sample to a 16-bit mono WAV. No model and no key,
// so Music Studio always has something real to play. It is an instrumental
// synth track; sung vocals still need a music model.

export const SAMPLE_RATE = 22_050;

export interface SynthSpec {
  bpm: number;
  seconds: number;
  /** 1 (calm) to 10 (driving). */
  energy?: number;
  key?: string;
  moods?: string[];
  /** Same seed, same song. */
  seed?: string;
}

export type Voice = "pad" | "bass" | "arp" | "kick" | "snare" | "hat";
export interface NoteEvent { kind: Voice; t: number; dur: number; midi?: number; vel: number }

const PITCH: Record<string, number> = {
  C: 0, "C#": 1, DB: 1, D: 2, "D#": 3, EB: 3, E: 4, F: 5, "F#": 6, GB: 6,
  G: 7, "G#": 8, AB: 8, A: 9, "A#": 10, BB: 10, B: 11,
};
const DARK = /sad|dark|melanch|moody|somb|tense|haunt|lonel|angry|epic|myster|night|rain/i;

export function parseKey(key?: string, moods: string[] = []): { root: number; minor: boolean } {
  const m = key?.trim().match(/^([A-Ga-g])([#b]?)\s*(m|min|minor|maj|major)?\b/);
  if (m) {
    const name = (m[1] + m[2]).toUpperCase();
    return { root: PITCH[name] ?? 0, minor: /^m(in|inor)?$/i.test(m[3] ?? "") };
  }
  return { root: 0, minor: moods.some((x) => DARK.test(x)) };
}

function rng(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Chord roots as semitones above the key, with their quality.
const MAJOR: [number, boolean][][] = [
  [[0, false], [7, false], [9, true], [5, false]],
  [[0, false], [5, false], [7, false], [5, false]],
  [[0, false], [9, true], [5, false], [7, false]],
];
const MINOR: [number, boolean][][] = [
  [[0, true], [8, false], [3, false], [10, false]],
  [[0, true], [5, true], [10, false], [3, false]],
  [[0, true], [10, false], [8, false], [7, false]],
];

export function composeTrack(spec: SynthSpec): { events: NoteEvent[]; root: number; minor: boolean } {
  const bpm = Math.min(Math.max(spec.bpm || 100, 50), 200);
  const energy = Math.min(Math.max(Math.round(spec.energy ?? 5), 1), 10);
  const seconds = Math.max(spec.seconds, 1);
  const rand = rng(spec.seed || "jarvis");
  const { root, minor } = parseKey(spec.key, spec.moods);
  const prog = (minor ? MINOR : MAJOR)[Math.floor(rand() * 3)];
  const beat = 60 / bpm;
  const bar = beat * 4;
  const events: NoteEvent[] = [];
  const push = (e: NoteEvent) => { if (e.t < seconds) events.push(e); };
  const arpStep = energy >= 5 && bpm < 130 ? beat / 4 : beat / 2;
  const arpShape = [0, 1, 2, 1, 2, 0, 2, 1].map(() => Math.floor(rand() * 4));

  for (let b = 0; b * bar < seconds; b++) {
    const [deg, isMinor] = prog[b % prog.length];
    const chordRoot = 48 + root + deg;
    const triad = [0, isMinor ? 3 : 4, 7].map((i) => chordRoot + i);
    const t0 = b * bar;
    for (const n of triad) push({ kind: "pad", t: t0, dur: bar, midi: n + 12, vel: 0.5 });
    const bassStep = energy >= 7 ? beat / 2 : beat;
    for (let t = 0; t < bar - 1e-9; t += bassStep) push({ kind: "bass", t: t0 + t, dur: bassStep * 0.9, midi: chordRoot - 12, vel: 0.8 });
    const tones = [...triad, triad[0] + 12].map((n) => n + 24);
    let i = 0;
    for (let t = 0; t < bar - 1e-9; t += arpStep, i++) push({ kind: "arp", t: t0 + t, dur: arpStep * 0.9, midi: tones[arpShape[i % arpShape.length]], vel: 0.35 + rand() * 0.15 });
    for (let k = 0; k < 4; k++) {
      const t = t0 + k * beat;
      if (energy >= 6 || k % 2 === 0) push({ kind: "kick", t, dur: 0.3, vel: 1 });
      if (energy >= 3 && k % 2 === 1) push({ kind: "snare", t, dur: 0.2, vel: 0.7 });
      if (energy >= 4) for (const h of [0, 0.5]) push({ kind: "hat", t: t + h * beat, dur: 0.05, vel: h ? 0.25 : 0.35 });
    }
  }
  return { events, root, minor };
}

const CALM = /calm|chill|lo-?fi|ambient|sleep|relax|soft|study|gentle|meditat/i;
const HIGH = /upbeat|dance|party|edm|techno|house|energetic|intense|workout|hype|drum ?and ?bass|fast/i;

// For a request in plain words (the chat's "make me a track ..."), where there
// is no musicologist brief to take tempo and energy from.
export function specFromText(text: string, seconds: number): SynthSpec {
  const bpm = Number(text.match(/(\d{2,3})\s*bpm/i)?.[1]);
  const energy = HIGH.test(text) ? 8 : CALM.test(text) ? 3 : 5;
  const key = text.match(/\b([A-G][#b]?\s*(?:minor|major|min|maj|m)?)\b(?=\s|$|[,.])/)?.[1];
  return {
    bpm: bpm >= 50 && bpm <= 200 ? bpm : energy === 8 ? 124 : energy === 3 ? 80 : 100,
    energy, seconds, seed: text, moods: text.split(/\W+/),
    ...(key && /\b(in|key)\b/i.test(text) ? { key } : {}),
  };
}

const freq = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

function renderEvent(out: Float32Array, e: NoteEvent, noise: () => number) {
  const start = Math.floor(e.t * SAMPLE_RATE);
  const len = Math.min(Math.floor(e.dur * SAMPLE_RATE), out.length - start);
  if (len <= 0) return;
  const f = e.midi === undefined ? 0 : freq(e.midi);
  let phase = 0, prev = 0, lp = 0;
  for (let n = 0; n < len; n++) {
    const t = n / SAMPLE_RATE;
    const left = (len - n) / SAMPLE_RATE;
    let s = 0;
    switch (e.kind) {
      case "pad": {
        const env = Math.min(t / 0.4, 1) * Math.min(left / 0.3, 1);
        const w = 2 * Math.PI * f * t;
        s = (Math.sin(w) + 0.5 * Math.sin(2 * w) + 0.25 * Math.sin(3 * w)) * env * 0.08;
        lp += (s - lp) * 0.2;
        s = lp;
        break;
      }
      case "bass": {
        const env = Math.min(t / 0.01, 1) * Math.exp(-t * 4) * Math.min(left / 0.02, 1);
        const w = 2 * Math.PI * f * t;
        s = (Math.sin(w) + 0.3 * Math.sign(Math.sin(w)) * 0.5) * env * 0.35;
        break;
      }
      case "arp": {
        const env = Math.min(t / 0.005, 1) * Math.exp(-t * 9) * Math.min(left / 0.01, 1);
        const x = (f * t) % 1;
        s = (4 * Math.abs(x - 0.5) - 1) * env * 0.18;
        break;
      }
      case "kick": {
        phase += (2 * Math.PI * (45 + 75 * Math.exp(-t * 30))) / SAMPLE_RATE;
        s = Math.sin(phase) * Math.exp(-t * 9) * 0.9;
        break;
      }
      case "snare": {
        const r = noise() * 2 - 1;
        s = (r * 0.7 + Math.sin(2 * Math.PI * 190 * t) * 0.3) * Math.exp(-t * 18) * 0.45;
        break;
      }
      case "hat": {
        const r = noise() * 2 - 1;
        s = (r - prev) * Math.exp(-t * 70) * 0.25;
        prev = r;
        break;
      }
    }
    out[start + n] += s * e.vel;
  }
}

export function renderWav(spec: SynthSpec): Uint8Array {
  const { events } = composeTrack(spec);
  const total = Math.floor(Math.max(spec.seconds, 1) * SAMPLE_RATE);
  const mix = new Float32Array(total);
  const noise = rng(`${spec.seed ?? "jarvis"}:noise`);
  for (const e of events) renderEvent(mix, e, noise);

  let peak = 0;
  for (const v of mix) peak = Math.max(peak, Math.abs(v));
  const gain = peak > 0 ? 0.9 / peak : 1;
  const fadeIn = SAMPLE_RATE * 0.3, fadeOut = SAMPLE_RATE * 1.5;

  const bytes = new Uint8Array(44 + total * 2);
  const view = new DataView(bytes.buffer);
  const str = (at: number, s: string) => { for (let i = 0; i < 4; i++) bytes[at + i] = s.charCodeAt(i); };
  str(0, "RIFF"); view.setUint32(4, 36 + total * 2, true); str(8, "WAVE");
  str(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, SAMPLE_RATE, true); view.setUint32(28, SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  str(36, "data"); view.setUint32(40, total * 2, true);
  for (let n = 0; n < total; n++) {
    const fade = Math.min(n / fadeIn, (total - n) / fadeOut, 1);
    const v = Math.tanh(mix[n] * gain * 1.1) * fade;
    view.setInt16(44 + n * 2, Math.round(v * 32767), true);
  }
  return bytes;
}
