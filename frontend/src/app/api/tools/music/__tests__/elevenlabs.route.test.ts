import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-auth", () => ({ getServerSession: () => Promise.resolve({ user: { email: "+919999999999" } }) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/music/agents", () => ({
  planSong: vi.fn(async (i: { vocals?: boolean }) => ({
    brief: { genre: "techno", bpm: 140, moods: ["dark"], energy: 8, instruments: ["909"], vocalStyle: "spoken", referenceArtists: [], culturalContext: "", region: "Berlin", era: "now" },
    plan: { prompt: "Dark warehouse techno", tags: "techno, 140 BPM", lyrics: i.vocals === false ? "" : "[Verse]\nRun" },
    sing: i.vocals !== false,
  })),
}));
vi.mock("@/lib/replicate", () => ({
  replicateConfigured: vi.fn(() => true),
  createPrediction: vi.fn(async () => ({ id: "rep123", status: "starting" })),
  getPrediction: vi.fn(),
  audioUrlFrom: vi.fn(),
}));
import { createPrediction } from "@/lib/replicate";

const post = async (body: unknown) => {
  const { POST } = await import("@/app/api/tools/music/route");
  const res = await POST(new Request("https://x.test/api/tools/music", { method: "POST", body: JSON.stringify(body) }) as never);
  return { status: res.status, json: await res.json() };
};
const song = () => new Response(new Uint8Array(30_000).fill(0xff), { headers: { "content-type": "audio/mpeg", "song-id": "s1" } });

beforeEach(() => { vi.stubEnv("ELEVENLABS_API_KEY", "test-key"); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe("/api/tools/music with ElevenLabs", () => {
  it("returns the sung song inline and never touches Replicate", async () => {
    const f = vi.fn().mockResolvedValue(song());
    vi.stubGlobal("fetch", f);
    const { status, json } = await post({ description: "a dark techno song", duration: 600 });
    expect(status).toBe(200);
    expect(json).toMatchObject({ configured: true, done: true, provider: "elevenlabs", model: "elevenlabs:music_v2_5", songId: "s1", clipSeconds: 180, loop: true, sessionSeconds: 600 });
    expect(json.audioUrl.startsWith("data:audio/mpeg;base64,")).toBe(true);
    const sent = JSON.parse(f.mock.calls[0][1].body);
    expect(sent.force_instrumental).toBe(false);
    expect(sent.prompt).toContain("Lyrics:\n[Verse]\nRun");
    expect(createPrediction).not.toHaveBeenCalled();
  });

  it("asks for an instrumental when vocals are off", async () => {
    const f = vi.fn().mockResolvedValue(song());
    vi.stubGlobal("fetch", f);
    await post({ description: "ambient", vocals: false, duration: 30 });
    const sent = JSON.parse(f.mock.calls[0][1].body);
    expect(sent).toMatchObject({ force_instrumental: true, music_length_ms: 30_000 });
    expect(sent.prompt).not.toContain("Lyrics:");
  });

  it("falls back to Replicate and says why when ElevenLabs refuses", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ detail: { message: "Upgrade your plan" } }), { status: 402 })));
    const { status, json } = await post({ description: "a dark techno song" });
    expect(status).toBe(200);
    expect(json).toMatchObject({ configured: true, jobId: "rep123" });
    expect(json.elevenLabsError).toMatch(/paid plan/);
    expect(createPrediction).toHaveBeenCalledTimes(1);
  });

  it("without the key, runs the Replicate path exactly as before", async () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "");
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    const { json } = await post({ description: "a dark techno song" });
    expect(json).toMatchObject({ configured: true, jobId: "rep123" });
    expect(json.elevenLabsError).toBeUndefined();
    expect(f).not.toHaveBeenCalled();
  });

  it("keeps the key out of every response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("bad key test-key", { status: 401 })));
    const { json } = await post({ description: "x" });
    expect(JSON.stringify(json)).not.toContain("test-key");
    expect(json.elevenLabsError).toMatch(/rejected the API key/);
  });
});
