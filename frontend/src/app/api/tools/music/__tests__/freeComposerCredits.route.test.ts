import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const charge = vi.hoisted(() => vi.fn(async () => Response.json({ error: "Not enough credits" }, { status: 402 })));
vi.mock("@/lib/credits", () => ({ chargedRoute: () => charge, refundable: (r: Response) => r, refundMusicJobOnce: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession: () => Promise.resolve({ user: { email: "zero-credit@example.test" } }) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/db", () => ({ getDb: () => ({ from: vi.fn() }) }));
vi.mock("@/lib/music/studioAudio", () => ({ storeStudioAudio: vi.fn(async () => "fixture-audio"), audioPath: () => "/api/studio/audio/fixture-audio", persistStudioRemoteAudio: vi.fn() }));
vi.mock("@/lib/music/agents", () => ({ planSong: vi.fn(async () => ({ brief: { genre: "lofi", bpm: 84, moods: [], energy: 3, instruments: [], vocalStyle: "soft", referenceArtists: [], culturalContext: "", region: "Global", era: "now" }, plan: { prompt: "test", tags: "lofi", lyrics: "[verse]\nSynthetic lyrics" }, sing: true })) }));
vi.mock("@/lib/replicate", () => ({ replicateConfigured: () => false, createPrediction: vi.fn(), getPrediction: vi.fn(), audioUrlFrom: vi.fn() }));
beforeEach(() => { vi.stubEnv("PAID_PATH_TESTS", ""); vi.stubEnv("FREE_TIER_CONFIRMED", ""); vi.stubEnv("ELEVENLABS_API_KEY", ""); charge.mockClear(); });
afterEach(() => vi.unstubAllEnvs());
describe("keyless music composer", () => {
  it("reaches stored audio for a zero-credit database account without charging", async () => {
    const { POST } = await import("../route");
    const res = await POST(new Request("https://fixture.test/api/tools/music", { method: "POST", body: JSON.stringify({ description: "Synthetic instrumental", vocals: true, duration: 30 }) }) as never);
    expect(res.status).toBe(200);
    expect(charge).not.toHaveBeenCalled();
    expect(await res.json()).toMatchObject({ audioUrl: "/api/studio/audio/fixture-audio", outputKind: "composed-instrumental", vocalsRendered: false, fellBackToInstrumental: true });
  });
});
