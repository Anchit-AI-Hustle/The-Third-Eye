// The Music Studio makes songs on ANCHOR's engine (anchor-autopilot anchor/studio.py, studio.yml).
// Anchit, 2026-11-20: "Music studio in jarvis must use this exact architecture and logics".
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next-auth", () => ({ getServerSession: () => Promise.resolve({ user: { email: "+919999999999" } }) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/music/agents", () => ({
  planSong: vi.fn(async (i: { vocals?: boolean }) => ({
    brief: { genre: "acid techno", bpm: 170, moods: ["euphoric"], energy: 9, instruments: ["303"], vocalStyle: "female alto", referenceArtists: [], culturalContext: "", region: "UK", era: "now" },
    plan: { prompt: "Acid rave", tags: "acid techno", lyrics: i.vocals === false ? "" : "[Verse]\nRun" },
    sing: i.vocals !== false,
  })),
}));
vi.mock("@/lib/llmCascade", () => ({
  llmCascade: vi.fn(async () => ({ text: JSON.stringify({ title: "Sun Comes Up", lyrics: `[Intro]\nHold my hand\n\n[Verse 1]\n${"We walked in when the gates were gold\n".repeat(8)}\n[Chorus]\nDance till the sun comes up\n\n[Drop]\n\n[Outro]\nHold my hand` }) })),
}));
vi.mock("@/lib/replicate", () => ({ replicateConfigured: vi.fn(() => true), createPrediction: vi.fn(), getPrediction: vi.fn(), audioUrlFrom: vi.fn() }));
vi.mock("@/lib/credits", () => ({
  chargedRoute: (_k: string, h: unknown) => h, refundable: (r: Response) => r,
  refundMusicJobOnce: vi.fn(async () => true),
}));
import { anchorJobId, anchorJobStarted, guideFor, ANCHOR_JOB } from "@/lib/music/anchorStudio";

const REPO = "https://api.github.com/repos/Anchit-AI-Hustle/anchor-autopilot";
const DL = "https://github.com/Anchit-AI-Hustle/anchor-autopilot/releases/download/";
const post = async (body: unknown) => {
  const { POST } = await import("@/app/api/tools/music/route");
  const res = await POST(new Request("https://x.test/api/tools/music", { method: "POST", body: JSON.stringify(body) }) as never);
  return { status: res.status, json: await res.json() };
};
const get = async (id: string) => {
  const { GET } = await import("@/app/api/tools/music/route");
  const res = await GET(new Request(`https://x.test/api/tools/music?id=${id}`) as never);
  return res.json();
};
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status });

beforeEach(() => { vi.stubEnv("ANCHOR_GITHUB_TOKEN", "test-token"); vi.stubEnv("ELEVENLABS_API_KEY", ""); vi.stubEnv("DATABASE_URL", ""); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe("Music Studio on ANCHOR's engine", () => {
  it("writes the lyrics by ANCHOR's guide and starts studio.yml on the Mac", async () => {
    const f = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", f);
    const { status, json: d } = await post({ description: "an acid psychedelic rave until sunrise", genre: "Acid Techno", tempo: 170, duration: 210 });
    expect(status).toBe(200);
    expect(d).toMatchObject({ configured: true, provider: "anchor", status: "queued", title: "Sun Comes Up", pollSeconds: 15, giveUpMinutes: 150 });
    expect(d.jobId).toMatch(ANCHOR_JOB);
    const [url, init] = f.mock.calls[0];
    expect(url).toBe(`${REPO}/actions/workflows/studio.yml/dispatches`);
    const body = JSON.parse(init.body);
    expect(body.ref).toBe("main");
    expect(body.inputs.id).toBe(d.jobId);
    const req = JSON.parse(body.inputs.request);
    expect(req).toMatchObject({ id: d.jobId, title: "Sun Comes Up", genre: "Acid Techno", bpm: 170, duration_s: 210, instrumental: false });
    expect(req.lyrics).toContain("[Chorus]\nDance till the sun comes up");
  });

  it("sends an instrumental without lyrics when vocals are off", async () => {
    const f = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", f);
    await post({ description: "rawstyle anthem", vocals: false });
    const req = JSON.parse(JSON.parse(f.mock.calls[0][1].body).inputs.request);
    expect(req).toMatchObject({ instrumental: true, lyrics: "" });
  });

  it("falls back to the other engines and says why when GitHub refuses", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("Bad credentials", { status: 401 })));
    const { json: d } = await post({ description: "acid rave" });
    expect(d.provider).not.toBe("anchor");
    expect(d.anchorError).toMatch(/GitHub 401/);
  });

  it("reports the Mac's progress while the song is made", async () => {
    const id = anchorJobId();
    vi.stubGlobal("fetch", vi.fn(async (u: string) => u.includes("/releases/tags/")
      ? json({}, 404)
      : json({ workflow_runs: [{ display_title: `Music Studio ${id}`, status: "in_progress" }] })));
    const d = await get(id);
    expect(d).toMatchObject({ status: "processing", audioUrl: null });
    expect(d.message).toMatch(/Mac GPU/);
  });

  it("plays the gated song from its release", async () => {
    const id = anchorJobId();
    const meta = { title: "Sun Comes Up", genre: "Acid Psychedelic Techno", bpm: 170, key: "A minor", arrangement: "club" };
    vi.stubGlobal("fetch", vi.fn(async (u: string) => u.includes("/releases/tags/")
      ? json({ assets: [{ name: "studio.json", browser_download_url: `${DL}studio-${id}/studio.json` }, { name: "sun-comes-up.mp3", browser_download_url: `${DL}studio-${id}/sun-comes-up.mp3` }] })
      : json(meta)));
    const d = await get(id);
    expect(d).toMatchObject({ status: "succeeded", audioUrl: `${DL}studio-${id}/sun-comes-up.mp3`, anchor: { genre: "Acid Psychedelic Techno" } });
  });

  it("refunds and explains when the song gate held every take", async () => {
    const id = anchorJobId();
    vi.stubGlobal("fetch", vi.fn(async (u: string) => u.includes("/releases/tags/")
      ? json({ assets: [{ name: "studio.json", browser_download_url: `${DL}studio-${id}/studio.json` }] })
      : json({ held: true, why: ["the music keeps breaking off in the middle"] })));
    const d = await get(id);
    expect(d).toMatchObject({ status: "failed", refunded: true });
    expect(d.error).toMatch(/song gate held every take/);
  });

  it("knows a job's age from its id, and the guide follows ANCHOR's models", () => {
    const now = Date.UTC(2026, 10, 20, 22, 0, 0);
    expect(Math.abs(anchorJobStarted(anchorJobId(now)) - now)).toBeLessThan(1000);
    expect(guideFor(true)).toMatch(/Model A/);
    expect(guideFor(false)).toMatch(/Model B/);
    expect(guideFor(false)).toMatch(/Never robots/);
  });
});
