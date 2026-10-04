import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// A Music Studio song from Eleven Music, end to end against a real Postgres
// that scripts/migrate.mjs has been applied to: TEST_DATABASE_URL=postgres://… npm test.
// ElevenLabs and the LLM agents are stubbed; storage, chunking, ownership and
// ranged playback are real.
const url = process.env.TEST_DATABASE_URL;
const U = `+9188${String(Date.now() % 1e8).padStart(8, "0")}`;
let who = U;

vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("next-auth", () => ({ getServerSession: () => Promise.resolve({ user: { email: who } }) }));
vi.mock("@/lib/music/agents", () => ({
  planSong: vi.fn().mockResolvedValue({
    brief: { genre: "techno", bpm: 140 },
    plan: { prompt: "Dark warehouse techno", tags: "techno, 140 BPM", lyrics: "[Verse]\nRun" },
    sing: true,
  }),
}));
vi.mock("@/lib/replicate", () => ({
  replicateConfigured: () => true, createPrediction: vi.fn(), getPrediction: vi.fn(), audioUrlFrom: vi.fn(),
}));

// 3.5 MB of recognisable bytes: four chunks, the last one partial.
const AUDIO = Buffer.from(Array.from({ length: 3_500_000 }, (_, i) => (i * 7) % 251));

describe.skipIf(!url)("Music Studio audio on Postgres", () => {
  let db: NonNullable<ReturnType<typeof import("@/lib/db").getDb>>;
  let path = "";

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    process.env.ELEVENLABS_API_KEY = "test-key";
    db = (await import("@/lib/db")).getDb()!;
  });
  afterAll(async () => {
    await db.from("music_studio_audio").delete().eq("user_id", U);
    delete process.env.ELEVENLABS_API_KEY;
    vi.unstubAllGlobals();
  });

  const get = async (p: string, range?: string) => {
    const { GET } = await import("@/app/api/tools/music/audio/[id]/route");
    const id = p.split("/").pop()!;
    return GET(new Request(`https://x.test${p}`, { headers: range ? { range } : {} }) as never, { params: Promise.resolve({ id }) });
  };

  it("stores the song and answers with a short URL, not the bytes", async () => {
    const f = vi.fn().mockResolvedValue(new Response(AUDIO, { headers: { "content-type": "audio/mpeg", "song-id": "s9" } }));
    vi.stubGlobal("fetch", f);
    const { POST } = await import("@/app/api/tools/music/route");
    const res = await POST(new Request("https://x.test/api/tools/music", { method: "POST", body: JSON.stringify({ description: "techno", duration: 240 }) }) as never);
    const body = await res.text();
    expect(body.length).toBeLessThan(10_000);
    const json = JSON.parse(body);
    expect(json).toMatchObject({ done: true, provider: "elevenlabs", songId: "s9" });
    expect(json.audioUrl).toMatch(/^\/api\/tools\/music\/audio\/[0-9a-f-]{36}$/);
    path = json.audioUrl;
    const { data: row } = await db.from("music_studio_audio").select("size, song_id, user_id").eq("id", path.split("/").pop()).single();
    expect(row).toMatchObject({ size: AUDIO.length, song_id: "s9", user_id: U });
    const { count } = await db.from("music_studio_audio_chunks").select("n", { count: "exact", head: true }).eq("audio_id", path.split("/").pop());
    expect(count).toBe(4);
  });

  it("plays it back byte for byte, whole and by range", async () => {
    const whole = await get(path);
    expect(whole.status).toBe(200);
    expect(Buffer.from(await whole.arrayBuffer()).equals(AUDIO)).toBe(true);

    const mid = await get(path, "bytes=1048000-2097200");
    expect(mid.status).toBe(206);
    expect(mid.headers.get("content-range")).toBe(`bytes 1048000-2097200/${AUDIO.length}`);
    expect(Buffer.from(await mid.arrayBuffer()).equals(AUDIO.subarray(1048000, 2097201))).toBe(true);

    const tail = await get(path, "bytes=-500");
    expect(Buffer.from(await tail.arrayBuffer()).equals(AUDIO.subarray(AUDIO.length - 500))).toBe(true);
    expect((await get(path, `bytes=${AUDIO.length}-`)).status).toBe(416);
  });

  it("is only ever served to its owner", async () => {
    who = "+910000000000";
    try { expect((await get(path)).status).toBe(404); } finally { who = U; }
  });

  it("goes with the account's other data", async () => {
    const id = path.split("/").pop();
    await db.from("music_studio_audio").delete().eq("user_id", U);
    const { count } = await db.from("music_studio_audio_chunks").select("n", { count: "exact", head: true }).eq("audio_id", id);
    expect(count).toBe(0);
  });
});
