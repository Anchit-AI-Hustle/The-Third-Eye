// Eleven Music through the ElevenLabs API — the same engine and key ANCHOR uses.
//
// POST https://api.elevenlabs.io/v1/music with a text prompt, the length in
// milliseconds and force_instrumental; the answer is the audio file itself
// (elevenlabs.io/docs/api-reference/music/compose). Lyrics travel inside the
// prompt: the API has no separate lyrics field. A prompt the service refuses as
// naming protected material comes back as a 4xx "bad_prompt" with a suggested
// rewrite, which is tried once. The key is read from ELEVENLABS_API_KEY and is
// never logged or returned. Music generation needs a paid ElevenLabs plan.
//
// The bytes come back to the caller, which stores them (lib/music/studioAudio.ts)
// and hands the Studio a short URL to play them by byte range. At 128 kbps the
// longest clip (CLIP_MAX) is under 4 MiB, one ranged answer; the player loops
// the clip to fill a longer session.

export const ENDPOINT = "https://api.elevenlabs.io/v1/music";
export const MODEL = process.env.ELEVENLABS_MUSIC_MODEL || "music_v2_5";
export const FORMAT = "mp3_44100_128";
export const CLIP_MAX = 240;          // seconds
export const CLIP_MIN = 10;
export const MAX_PROMPT = 4100;        // the API's limit on `prompt`
const MAX_BYTES = 20 * 1024 * 1024;

export class ElevenLabsError extends Error {
  constructor(message: string, readonly status?: number) { super(message); this.name = "ElevenLabsError"; }
}

// ElevenLabs stopped accepting the key id shown in the dashboard (August 2026).
// A working secret is the value shown once at creation, and it starts with sk_.
// Sending the id back produces HTTP 400 "API key ID used as API key".
function usableElevenKey(raw: string | undefined): string | null {
  const k = raw?.trim();
  return k && k.startsWith("sk_") ? k : null;
}

export function elevenLabsKey(): string | null {
  return usableElevenKey(process.env.ELEVENLABS_API_KEY)
    ?? usableElevenKey(process.env.ELEVEN_API_KEY)
    ?? usableElevenKey(process.env.XI_API_KEY);
}

export function elevenLabsConfigured(): boolean {
  return elevenLabsKey() !== null;
}

export function clipSecondsFor(sessionSeconds: number): number {
  return Math.min(Math.max(Math.round(sessionSeconds) || 30, CLIP_MIN), CLIP_MAX);
}

/**
 * One prompt from the pipeline's plan: the producer prompt, the style tags and,
 * when the song is sung, the lyrics. When it has to be cut to the API's limit the
 * lyrics are kept whole and the description gives way first.
 */
export function elevenPrompt(p: { prompt: string; tags: string; lyrics: string; sing: boolean }): string {
  const style = p.tags.trim() ? `Style: ${p.tags.trim()}` : "";
  const lyrics = p.sing && p.lyrics.trim() ? `Lyrics:\n${p.lyrics.trim()}` : "";
  const tail = [style, lyrics].filter(Boolean).join("\n\n");
  const room = MAX_PROMPT - tail.length - (tail ? 2 : 0);
  if (room < 200) {
    // Lyrics too long to leave room for a description: keep the start of each.
    return [p.prompt.trim().slice(0, 600), style, lyrics].filter(Boolean).join("\n\n").slice(0, MAX_PROMPT);
  }
  return [p.prompt.trim().slice(0, room), tail].filter(Boolean).join("\n\n");
}

/** The rewrite the service offers with a bad_prompt refusal, if there is one. */
export function suggestion(body: string): string | null {
  try {
    const detail = (JSON.parse(body) as { detail?: unknown }).detail;
    if (detail && typeof detail === "object" && (detail as { status?: string }).status === "bad_prompt") {
      const s = (detail as { data?: { prompt_suggestion?: unknown } }).data?.prompt_suggestion;
      return typeof s === "string" && s.trim() ? s : null;
    }
  } catch { /* not JSON */ }
  return null;
}

/** A short, human reason for a refusal; plan and key problems are named plainly. */
export function reason(status: number, body: string): string {
  let msg = body;
  try {
    const d = (JSON.parse(body) as { detail?: unknown }).detail;
    if (typeof d === "string") msg = d;
    else if (d && typeof d === "object") msg = String((d as { message?: unknown }).message ?? (d as { status?: unknown }).status ?? body);
  } catch { /* keep the raw text */ }
  msg = msg.replace(/\s+/g, " ").trim().slice(0, 200);
  if (status === 401) return `ElevenLabs rejected the API key (401)${msg ? `: ${msg}` : ""}`;
  if (status === 402 || /paid|plan|subscri|upgrade|quota|credits/i.test(msg)) {
    return `ElevenLabs music needs a paid plan with music credits left (HTTP ${status})${msg ? `: ${msg}` : ""}`;
  }
  return `ElevenLabs HTTP ${status}${msg ? `: ${msg}` : ""}`;
}

export interface ElevenResult {
  audio: Buffer; mime: string; model: string; outputFormat: string; songId: string | null; seconds: number;
}

/**
 * Compose one song. `deadline` is an epoch-ms time the whole call must finish by
 * (the function's own lifetime); nothing is retried past it.
 */
export async function composeElevenLabs(opts: {
  prompt: string; seconds: number; instrumental: boolean; deadline: number;
  fetchImpl?: typeof fetch; wait?: (ms: number) => Promise<void>;
}): Promise<ElevenResult> {
  const key = elevenLabsKey();
  if (!key) throw new ElevenLabsError("ELEVENLABS_API_KEY is not set");
  const doFetch = opts.fetchImpl ?? fetch;
  const wait = opts.wait ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const seconds = Math.min(Math.max(Math.round(opts.seconds), CLIP_MIN), CLIP_MAX);
  let outputFormat = FORMAT;
  let body: Record<string, unknown> = {
    prompt: opts.prompt.slice(0, MAX_PROMPT),
    music_length_ms: seconds * 1000,
    model_id: MODEL,
    force_instrumental: opts.instrumental,
  };
  let rewritten = false, retried = false, formatFallback = false;

  for (;;) {
    const left = opts.deadline - Date.now();
    if (left < 5_000) throw new ElevenLabsError("ElevenLabs did not finish in time");
    let res: Response;
    try {
      res = await doFetch(`${ENDPOINT}?output_format=${encodeURIComponent(outputFormat)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "xi-api-key": key, Accept: "audio/mpeg" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(left - 2_000),
      });
    } catch (e) {
      const timedOut = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
      if (timedOut) throw new ElevenLabsError("ElevenLabs did not finish in time");
      if (!retried && opts.deadline - Date.now() > 60_000) { retried = true; await wait(2_000); continue; }
      throw new ElevenLabsError(`ElevenLabs network error: ${e instanceof Error ? e.message : "unknown"}`);
    }

    if (!res.ok) {
      const text = (await res.text().catch(() => "")).slice(0, 2_000).split(key).join("[key]");
      const better = suggestion(text);
      if (better && !rewritten) { rewritten = true; body = { ...body, prompt: better.slice(0, MAX_PROMPT) }; continue; }
      if ((res.status === 400 || res.status === 422) && /output_format/i.test(text) && !formatFallback) {
        formatFallback = true; outputFormat = "mp3_44100_64"; continue;
      }
      if ([429, 500, 502, 503, 504].includes(res.status) && !retried && opts.deadline - Date.now() > 60_000) {
        retried = true; await wait(3_000); continue;
      }
      throw new ElevenLabsError(reason(res.status, text), res.status);
    }

    const ct = (res.headers.get("content-type") || "").split(";")[0].trim();
    if (ct.includes("json") || ct.startsWith("text/")) {
      throw new ElevenLabsError(`ElevenLabs answered with ${ct}, not audio`);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 10_000) throw new ElevenLabsError(`ElevenLabs returned ${buf.length} bytes, not a song`);
    if (buf.length > MAX_BYTES) throw new ElevenLabsError(`ElevenLabs returned ${(buf.length / 1e6).toFixed(1)} MB, more than a song should be`);
    const mime = ct.startsWith("audio/") ? ct : "audio/mpeg";
    return { audio: buf, mime, model: String(body.model_id), outputFormat, songId: res.headers.get("song-id"), seconds };
  }
}
