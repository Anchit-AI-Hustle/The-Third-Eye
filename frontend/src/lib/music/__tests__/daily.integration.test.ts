import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// The daily drop against a real Postgres that scripts/migrate.mjs has been
// applied to: TEST_DATABASE_URL=postgres://… npm test. Replicate, the LLMs and
// push are stubbed; storage, chunking and ranged playback are real.
const url = process.env.TEST_DATABASE_URL;
const U = `+9177${String(Date.now() % 1e8).padStart(8, "0")}`;

const createPrediction = vi.fn();
const getPrediction = vi.fn();
vi.mock("@/lib/replicate", async () => ({
  ...(await vi.importActual<typeof import("@/lib/replicate")>("@/lib/replicate")),
  replicateConfigured: () => true,
  createPrediction: (...a: unknown[]) => createPrediction(...a),
  getPrediction: (...a: unknown[]) => getPrediction(...a),
}));
vi.mock("@/lib/push", () => ({ sendPush: vi.fn().mockResolvedValue(true) }));
vi.mock("@/lib/llmCascade", () => ({
  llmCascade: vi.fn().mockResolvedValue({ text: '{"title":"Neon Mantra","description":"Acid lines over a rolling bass."}', provider: "test" }),
}));
vi.mock("@/lib/music/agents", () => ({
  planSong: vi.fn().mockResolvedValue({
    brief: { bpm: 200 },
    plan: { prompt: "p", tags: "200 bpm, psytrance", lyrics: "[drop]\nom namah" },
    sing: true,
  }),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("next-auth", () => ({ getServerSession: () => Promise.resolve({ user: { email: U } }) }));
// after() needs a request scope; here the deferred work is collected and awaited.
const deferred: Promise<unknown>[] = [];
vi.mock("next/server", async () => ({
  ...(await vi.importActual<typeof import("next/server")>("next/server")),
  after: (fn: () => Promise<unknown>) => { deferred.push(fn()); },
}));

// 2.5 chunks of recognisable bytes.
const AUDIO = Buffer.from(Array.from({ length: 2.5 * 1024 * 1024 }, (_, i) => i % 251));

describe.skipIf(!url)("daily drop on Postgres", () => {
  let db: NonNullable<ReturnType<typeof import("@/lib/db").getDb>>;

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    process.env.NEXTAUTH_URL = "https://app.example.com";
    process.env.CRON_SECRET = "s3cret";
    db = (await import("@/lib/db")).getDb()!;
    await db.from("music_daily").upsert({ user_id: U, enabled: true, preset: { description: "acid rave", genre: "Psytrance", tempo: 200, duration: 600 }, refs: "Project Mayhem" }, { onConflict: "user_id" });
  });
  afterAll(async () => {
    await db.from("music_daily_tracks").delete().eq("user_id", U);
    await db.from("music_daily").delete().eq("user_id", U);
  });

  it("starts one render per day, with a webhook back to the app", async () => {
    createPrediction.mockResolvedValue({ id: "pred123", status: "starting" });
    const { runDaily, today } = await import("@/lib/music/daily");
    expect(await runDaily(db, U)).toBe("started");
    expect(await runDaily(db, U)).toBe("exists");
    const { data: row } = await db.from("music_daily_tracks").select("day").eq("user_id", U).single();
    expect(row.day).toBe(today());
    expect(createPrediction).toHaveBeenCalledTimes(1);
    const [, input, , opts] = createPrediction.mock.calls[0];
    expect(input).toMatchObject({ tags: "200 bpm, psytrance", duration: 240 });
    expect(opts.webhook).toMatch(/^https:\/\/app\.example\.com\/api\/tools\/music\/daily\/webhook\?token=[a-f0-9]{48}$/);
  });

  it("lets only one of two overlapping finalizes store the audio", async () => {
    // A webhook retry racing the listing's fallback used to interleave their
    // delete-and-insert of the same chunks.
    const { data: row } = await db.from("music_daily_tracks").select("id, user_id, day, title, status, prediction_id, token, created_at").eq("user_id", U).single();
    getPrediction.mockResolvedValue({ id: "pred123", status: "succeeded", output: "https://replicate.delivery/x/out.mp3", error: null });
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => new Response(AUDIO, { headers: { "content-type": "audio/mpeg" } })));
    const { finalize } = await import("@/lib/music/daily");
    const results = await Promise.all([finalize(db, row), finalize(db, row)]);
    vi.unstubAllGlobals();
    expect(results.sort()).toEqual(["done", "pending"]);
    const { count } = await db.from("music_daily_chunks").select("n", { count: "exact", head: true }).eq("track_id", row.id);
    expect(count).toBe(3);
  });

  it("stores the audio when Replicate says it is done, whatever the webhook body says", async () => {
    // Start again from pending so the webhook path itself is exercised.
    await db.from("music_daily_tracks").update({ status: "pending", claimed_at: null, size: null }).eq("user_id", U);
    const { data: row } = await db.from("music_daily_tracks").select("token").eq("user_id", U).single();
    getPrediction.mockResolvedValue({ id: "pred123", status: "succeeded", output: "https://replicate.delivery/x/out.mp3", error: null });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(AUDIO, { headers: { "content-type": "audio/mpeg" } })));
    const { POST } = await import("@/app/api/tools/music/daily/webhook/route");
    const res = await POST(new Request(`https://x/api?token=${row.token}`, { method: "POST", body: '{"status":"failed"}' }) as never);
    expect(await res.json()).toEqual({ status: "done" });
    vi.unstubAllGlobals();
    expect((await POST(new Request("https://x/api?token=" + "0".repeat(48), { method: "POST" }) as never)).status).toBe(404);
  });

  it("plays back by byte range, in pieces small enough for a Vercel response", async () => {
    const { data: t } = await db.from("music_daily_tracks").select("id, size").eq("user_id", U).single();
    expect(t.size).toBe(AUDIO.length);
    const { GET } = await import("@/app/api/tools/music/daily/[id]/route");
    const get = (range?: string) => GET(new Request("https://x", { headers: range ? { range } : {} }) as never, { params: Promise.resolve({ id: t.id }) });

    const whole = await get();
    expect(whole.status).toBe(206);
    expect(whole.headers.get("content-range")).toBe(`bytes 0-${AUDIO.length - 1}/${AUDIO.length}`);
    expect(Buffer.from(await whole.arrayBuffer()).equals(AUDIO)).toBe(true);

    const mid = await get(`bytes=${1024 * 1024 - 3}-${1024 * 1024 + 4}`);
    expect(Buffer.from(await mid.arrayBuffer()).equals(AUDIO.subarray(1024 * 1024 - 3, 1024 * 1024 + 5))).toBe(true);

    const tail = await get("bytes=-10");
    expect(Buffer.from(await tail.arrayBuffer()).equals(AUDIO.subarray(AUDIO.length - 10))).toBe(true);
    expect((await get(`bytes=${AUDIO.length}-`)).status).toBe(416);
  });

  it("chains the cron's users, one invocation each, behind the cron secret", async () => {
    const calls: { users: string[]; auth: string | null }[] = [];
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async (_u: string, init: RequestInit) => {
      calls.push({ users: JSON.parse(String(init.body)).users, auth: new Headers(init.headers).get("authorization") });
      return new Response(null, { status: 202 });
    }));
    const { POST } = await import("@/app/api/tools/music/daily/run/route");
    const call = (users: unknown, auth = "Bearer s3cret") => POST(new Request("https://x", { method: "POST", headers: { authorization: auth }, body: JSON.stringify({ users }) }) as never);
    expect((await call(["a"], "Bearer nope")).status).toBe(401);
    expect((await call([])).status).toBe(400);

    // U already has today's track, so its link finds it done and passes on the rest.
    expect((await call([U, "next-user", "last-user"])).status).toBe(202);
    await Promise.all(deferred);
    vi.unstubAllGlobals();
    expect(calls).toEqual([{ users: ["next-user", "last-user"], auth: "Bearer s3cret" }]);
    expect(createPrediction).toHaveBeenCalledTimes(1);
  });

  it("lists the user's tracks without the webhook token", async () => {
    const { GET } = await import("@/app/api/tools/music/daily/route");
    const d = await (await GET()).json();
    expect(d.settings.refs).toBe("Project Mayhem");
    expect(d.tracks[0]).toMatchObject({ title: "Neon Mantra", status: "done", bpm: 200 });
    expect(d.tracks[0].token).toBeUndefined();
  });
});
