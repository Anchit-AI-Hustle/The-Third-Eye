// A neural voice that runs entirely in the browser: Kokoro, an 82M-parameter
// TTS model on WebGPU. Free, no key, nothing leaves the device; the cost is a
// one-time ~86 MB model download the browser caches. Adapted from
// adewaskar/jarvis (MIT). Anything that goes wrong returns false so the caller
// speaks with the system voice instead of going silent.

const KOKORO_URL = "https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/dist/kokoro.web.js";
const MODEL = "onnx-community/Kokoro-82M-v1.0-ONNX";
export const NATURAL_VOICE_KEY = "jarvis_natural_voice";
const VOICE = "bm_george";
// One failure may be a lost GPU device; a run of them means this machine can't.
const MAX_FAILURES = 3;

type Kokoro = { generate: (text: string, o: { voice: string; speed?: number }) => Promise<{ toBlob: () => Blob }> };
type Importer = () => Promise<{ KokoroTTS: { from_pretrained: (m: string, o: object) => Promise<unknown> } }>;

let model: Kokoro | null = null;
let loading: Promise<Kokoro | null> | null = null;
let failed = false;
let failures = 0;
let progress = 0;
let current: HTMLAudioElement | null = null;
let generation = 0;

export const naturalVoiceProgress = () => progress;
export const naturalVoiceSupported = () => typeof navigator !== "undefined" && "gpu" in navigator;

export function naturalVoiceOn(): boolean {
  try { return localStorage.getItem(NATURAL_VOICE_KEY) === "1"; } catch { return false; }
}

const importKokoro: Importer = () => import(/* webpackIgnore: true */ KOKORO_URL);

export function loadNaturalVoice(importer: Importer = importKokoro): Promise<Kokoro | null> {
  if (model) return Promise.resolve(model);
  if (failed || !naturalVoiceSupported()) return Promise.resolve(null);
  loading ??= (async () => {
    try {
      const { KokoroTTS } = await importer();
      model = (await KokoroTTS.from_pretrained(MODEL, {
        dtype: "q8",
        device: "webgpu",
        progress_callback: (p: { progress?: number }) => { if (typeof p?.progress === "number") progress = p.progress / 100; },
      })) as Kokoro;
      progress = 1;
      return model;
    } catch (e) {
      console.warn("natural voice unavailable, using the system voice:", e);
      failed = true;
      return null;
    } finally {
      loading = null;
    }
  })();
  return loading;
}

export function splitSentences(text: string): string[] {
  const parts = text.replace(/\s+/g, " ").trim().match(/.+?(?:[.!?]+(?=\s|$)|$)/g) ?? [];
  const out: string[] = [];
  for (const raw of parts) {
    const s = raw.trim();
    if (!s) continue;
    // A fragment this short ("Ok.") sounds clipped on its own.
    if (out.length && (s.length < 12 || out[out.length - 1].length < 12)) out[out.length - 1] += ` ${s}`;
    else out.push(s);
  }
  return out.flatMap((s) => s.match(/.{1,400}(?:\s|$)/g)?.map((c) => c.trim()) ?? [s]);
}

async function render(tts: Kokoro, text: string): Promise<string | null> {
  try {
    const audio = await tts.generate(text, { voice: VOICE, speed: 0.95 });
    failures = 0;
    return URL.createObjectURL(audio.toBlob());
  } catch (e) {
    console.error("natural voice generation failed:", e);
    if (++failures >= MAX_FAILURES) failed = true;
    return null;
  }
}

/** Speaks text sentence by sentence. False when the voice isn't usable, so the caller can fall back. */
export async function speakNatural(text: string, o: { volume?: number; onStart?: () => void; onEnd?: () => void }): Promise<boolean> {
  const tts = await loadNaturalVoice();
  if (!tts) return false;
  const id = ++generation;
  const sentences = splitSentences(text);
  let url = await render(tts, sentences[0] ?? "");
  if (!url) return false;
  o.onStart?.();
  for (let i = 0; url && id === generation; i++) {
    // The next sentence renders while this one plays.
    const pending = i + 1 < sentences.length ? render(tts, sentences[i + 1]) : null;
    const playing = url;
    await new Promise<void>((done) => {
      const a = new Audio(playing);
      a.volume = o.volume ?? 1;
      current = a;
      a.onended = a.onerror = () => { URL.revokeObjectURL(playing); done(); };
      a.play().catch(() => done());
    });
    url = pending ? await pending : null;
  }
  if (id === generation) current = null;
  o.onEnd?.();
  return true;
}

export function stopNatural() {
  generation++;
  current?.pause();
  current?.onended?.(new Event("ended"));
  current = null;
}

/** Test-only. */
export function resetNaturalVoice() {
  model = null; loading = null; failed = false; failures = 0; progress = 0; current = null;
}
