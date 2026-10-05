import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CLIP_MAX, MAX_PROMPT, ElevenLabsError, clipSecondsFor, composeElevenLabs, elevenPrompt, reason, suggestion,
} from "@/lib/music/elevenlabs";

const mp3 = (n = 20_000) => new Uint8Array(n).fill(0xff);
const audio = (n?: number, headers: Record<string, string> = {}) =>
  new Response(mp3(n), { status: 200, headers: { "content-type": "audio/mpeg", "song-id": "song_1", ...headers } });
const err = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const noWait = () => Promise.resolve();
const later = () => Date.now() + 280_000;

beforeEach(() => { vi.stubEnv("ELEVENLABS_API_KEY", "sk_test-key"); });
afterEach(() => { vi.unstubAllEnvs(); });

describe("elevenPrompt", () => {
  it("carries the prompt, the style and the lyrics of a sung song", () => {
    const p = elevenPrompt({ prompt: "Dark warehouse techno", tags: "techno, 140 BPM", lyrics: "[Verse]\nRun", sing: true });
    expect(p).toBe("Dark warehouse techno\n\nStyle: techno, 140 BPM\n\nLyrics:\n[Verse]\nRun");
  });
  it("leaves lyrics out of an instrumental", () => {
    expect(elevenPrompt({ prompt: "Ambient", tags: "", lyrics: "words", sing: false })).toBe("Ambient");
  });
  it("stays within the API limit and keeps the lyrics whole", () => {
    const lyrics = "la ".repeat(600).trim();
    const p = elevenPrompt({ prompt: "x".repeat(5000), tags: "pop", lyrics, sing: true });
    expect(p.length).toBeLessThanOrEqual(MAX_PROMPT);
    expect(p.endsWith(lyrics)).toBe(true);
  });
  it("never exceeds the limit even with very long lyrics", () => {
    const p = elevenPrompt({ prompt: "y".repeat(3000), tags: "pop", lyrics: "z".repeat(6000), sing: true });
    expect(p.length).toBeLessThanOrEqual(MAX_PROMPT);
    expect(p.startsWith("y")).toBe(true);
  });
});

describe("sizes", () => {
  it("caps the clip so the longest song is one ranged answer", () => {
    expect(clipSecondsFor(18_000)).toBe(CLIP_MAX);
    expect(clipSecondsFor(3)).toBe(10);
    // 240 s at 128 kbps is under four 1 MiB chunks, the most one answer carries
    expect((CLIP_MAX * 128_000) / 8).toBeLessThan(4 * 1024 * 1024);
  });
});

describe("refusals", () => {
  it("reads the rewrite offered with bad_prompt", () => {
    expect(suggestion(JSON.stringify({ detail: { status: "bad_prompt", data: { prompt_suggestion: "a song in the style of 90s rave" } } })))
      .toBe("a song in the style of 90s rave");
    expect(suggestion("not json")).toBeNull();
  });
  it("names key and plan problems plainly", () => {
    expect(reason(401, JSON.stringify({ detail: { message: "Invalid API key" } }))).toMatch(/rejected the API key/);
    expect(reason(402, "{}")).toMatch(/paid plan/);
    expect(reason(403, JSON.stringify({ detail: { status: "missing_permissions", message: "Music requires a paid subscription" } }))).toMatch(/paid plan/);
  });
});

describe("composeElevenLabs", () => {
  it("sends the documented request and returns the song's bytes", async () => {
    const f = vi.fn().mockResolvedValue(audio());
    const r = await composeElevenLabs({ prompt: "p", seconds: 95, instrumental: false, deadline: later(), fetchImpl: f, wait: noWait });
    const [url, init] = f.mock.calls[0];
    expect(url).toBe("https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128");
    expect(init.headers["xi-api-key"]).toBe("sk_test-key");
    expect(JSON.parse(init.body)).toEqual({ prompt: "p", music_length_ms: 95_000, model_id: "music_v2_5", force_instrumental: false });
    expect(r.audio.length).toBe(20_000);
    expect(r).toMatchObject({ mime: "audio/mpeg", songId: "song_1", seconds: 95, model: "music_v2_5", outputFormat: "mp3_44100_128" });
  });

  it("retries once with the service's rewrite of a refused prompt", async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(err(400, { detail: { status: "bad_prompt", data: { prompt_suggestion: "clean prompt" } } }))
      .mockResolvedValueOnce(audio());
    await composeElevenLabs({ prompt: "named artist", seconds: 60, instrumental: true, deadline: later(), fetchImpl: f, wait: noWait });
    expect(JSON.parse(f.mock.calls[1][1].body).prompt).toBe("clean prompt");
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("retries a busy service once, then gives up with the reason", async () => {
    const f = vi.fn().mockImplementation(async () => err(503, { detail: "busy" }));
    await expect(composeElevenLabs({ prompt: "p", seconds: 60, instrumental: true, deadline: later(), fetchImpl: f, wait: noWait }))
      .rejects.toThrow(/HTTP 503: busy/);
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("does not retry a key or plan refusal", async () => {
    const f = vi.fn().mockResolvedValue(err(402, { detail: { message: "Upgrade your plan" } }));
    await expect(composeElevenLabs({ prompt: "p", seconds: 60, instrumental: true, deadline: later(), fetchImpl: f, wait: noWait }))
      .rejects.toThrow(/paid plan/);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("falls back to a smaller format the service accepts", async () => {
    const f = vi.fn().mockResolvedValueOnce(err(422, { detail: "Invalid output_format" })).mockResolvedValueOnce(audio());
    const r = await composeElevenLabs({ prompt: "p", seconds: 60, instrumental: true, deadline: later(), fetchImpl: f, wait: noWait });
    expect(f.mock.calls[1][0]).toContain("output_format=mp3_44100_64");
    expect(r.outputFormat).toBe("mp3_44100_64");
  });

  it("refuses a body that is not audio, or too small, or absurdly large", async () => {
    const run = (res: Response) => composeElevenLabs({ prompt: "p", seconds: 60, instrumental: true, deadline: later(), fetchImpl: vi.fn().mockResolvedValue(res), wait: noWait });
    await expect(run(new Response("{}", { headers: { "content-type": "application/json" } }))).rejects.toThrow(/not audio/);
    await expect(run(audio(500))).rejects.toThrow(/not a song/);
    await expect(run(audio(21 * 1024 * 1024))).rejects.toThrow(/more than a song/);
  });

  it("does not start when the function has no time left", async () => {
    const f = vi.fn();
    await expect(composeElevenLabs({ prompt: "p", seconds: 60, instrumental: true, deadline: Date.now() + 1_000, fetchImpl: f, wait: noWait }))
      .rejects.toBeInstanceOf(ElevenLabsError);
    expect(f).not.toHaveBeenCalled();
  });

  it("needs the key", async () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "");
    await expect(composeElevenLabs({ prompt: "p", seconds: 60, instrumental: true, deadline: later(), fetchImpl: vi.fn(), wait: noWait }))
      .rejects.toThrow(/not set/);
  });

  it("does not send a key id", async () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "a1b2c3d4");
    const f = vi.fn();
    await expect(composeElevenLabs({ prompt: "p", seconds: 60, instrumental: true, deadline: later(), fetchImpl: f, wait: noWait }))
      .rejects.toThrow(/not set/);
    expect(f).not.toHaveBeenCalled();
  });
});
