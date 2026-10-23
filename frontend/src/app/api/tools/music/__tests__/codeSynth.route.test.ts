import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-auth", () => ({ getServerSession: () => Promise.resolve({ user: { email: "u@x.com" } }) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/music/agents", () => ({
  planSong: vi.fn(async () => ({
    brief: { genre: "lofi", bpm: 84, moods: ["rainy", "calm"], energy: 3, instruments: ["keys"], vocalStyle: "soft", referenceArtists: [], culturalContext: "", region: "Global", era: "now" },
    plan: { prompt: "Rainy lofi beat", tags: "lofi, 84 BPM", lyrics: "[Verse]\nRain on the glass" },
    sing: true,
  })),
}));
vi.mock("@/lib/replicate", () => ({ replicateConfigured: () => false, createPrediction: vi.fn(), getPrediction: vi.fn(), audioUrlFrom: vi.fn() }));

const post = async (body: unknown) => {
  const { POST } = await import("@/app/api/tools/music/route");
  const res = await POST(new Request("https://x.test/api/tools/music", { method: "POST", body: JSON.stringify(body) }) as never);
  return { status: res.status, json: await res.json() };
};

beforeEach(() => {
  vi.stubEnv("ELEVENLABS_API_KEY", "");
  vi.stubEnv("HF_API_TOKEN", "");
  vi.stubEnv("HUGGINGFACE_API_KEY", "");
  vi.stubEnv("DATABASE_URL", "");
  vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 500 })));
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("/api/tools/music with no music AI set up", () => {
  it("composes a real instrumental in code instead of returning nothing", async () => {
    const { status, json } = await post({ description: "rainy lofi to study to", duration: 30 });
    expect(status).toBe(200);
    expect(json).toMatchObject({ configured: true, done: true, provider: "code", clipSeconds: 30 });
    expect(json.audioUrl.startsWith("data:audio/wav;base64,")).toBe(true);
    const wav = Buffer.from(json.audioUrl.split(",")[1], "base64");
    expect(wav.subarray(0, 4).toString()).toBe("RIFF");
    expect(wav.length).toBeGreaterThan(30 * 22_050 * 2);
  });

  it("says plainly that it is an instrumental, without exposing how it was made", async () => {
    const { json } = await post({ description: "rainy lofi to study to", vocals: true, duration: 30 });
    expect(json.note).toMatch(/no vocals/i);
    expect(json.note).not.toMatch(/in code|free|API_KEY|TOKEN/i);
    expect(json.lyrics).toContain("Rain on the glass");
  });
});
