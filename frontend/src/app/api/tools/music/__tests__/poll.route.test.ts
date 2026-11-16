import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-auth", () => ({ getServerSession: () => Promise.resolve({ user: { email: "u@x.com" } }) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/credits", async () => {
  const actual = await vi.importActual<typeof import("@/lib/credits")>("@/lib/credits");
  return { ...actual, refundMusicJobOnce: vi.fn(async () => true), chargedRoute: (_a: string, h: unknown) => h };
});
vi.mock("@/lib/replicate", () => ({
  replicateConfigured: () => true,
  createPrediction: vi.fn(),
  getPrediction: vi.fn(),
  audioUrlFrom: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ getDb: () => null }));

import { getPrediction, audioUrlFrom } from "@/lib/replicate";
import { refundMusicJobOnce } from "@/lib/credits";

const get = async (id: string) => {
  const { GET } = await import("@/app/api/tools/music/route");
  const res = await GET(new Request(`https://x.test/api/tools/music?id=${id}`) as never);
  return { status: res.status, json: await res.json() };
};

beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => { vi.resetModules(); });

describe("GET /api/tools/music poll", () => {
  it("refunds and fails when the job failed", async () => {
    vi.mocked(getPrediction).mockResolvedValueOnce({ status: "failed", error: "OOM", output: null } as never);
    const { status, json } = await get("abc123");
    expect(status).toBe(200);
    expect(json).toMatchObject({ status: "failed", audioUrl: null, refunded: true });
    expect(refundMusicJobOnce).toHaveBeenCalledWith("u@x.com", "abc123");
  });

  it("refunds when succeeded without a parseable audio URL", async () => {
    vi.mocked(getPrediction).mockResolvedValueOnce({ status: "succeeded", error: null, output: {} } as never);
    vi.mocked(audioUrlFrom).mockReturnValueOnce(null);
    const { json } = await get("xyz789");
    expect(json).toMatchObject({ status: "failed", audioUrl: null, refunded: true });
    expect(json.error).toMatch(/without an audio file/i);
  });

  it("returns the remote URL when there is no database to persist into", async () => {
    vi.mocked(getPrediction).mockResolvedValueOnce({ status: "succeeded", error: null, output: "https://replicate.delivery/x/a.mp3" } as never);
    vi.mocked(audioUrlFrom).mockReturnValueOnce("https://replicate.delivery/x/a.mp3");
    const { json } = await get("ok1");
    expect(json).toMatchObject({ status: "succeeded", audioUrl: "https://replicate.delivery/x/a.mp3" });
    expect(refundMusicJobOnce).not.toHaveBeenCalled();
  });
});
