import { beforeEach, describe, expect, it, vi } from "vitest";

const createPrediction = vi.fn();
const planScenes = vi.fn();

vi.mock("next-auth", () => ({ getServerSession: () => Promise.resolve({ user: { email: "+919999999999" } }) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/videoScenes", () => ({ planScenes: (...a: unknown[]) => planScenes(...a) }));
vi.mock("@/lib/replicate", async () => ({
  ...(await vi.importActual<typeof import("@/lib/replicate")>("@/lib/replicate")),
  replicateConfigured: () => true,
  createPrediction: (...a: unknown[]) => createPrediction(...a),
}));

const post = async (body: unknown) => {
  const { POST } = await import("@/app/api/tools/video/route");
  return POST(new Request("https://x.test/api/tools/video", { method: "POST", body: JSON.stringify(body) }) as never);
};

beforeEach(() => {
  vi.clearAllMocks();
  createPrediction.mockResolvedValue({ id: "abc123", status: "starting" });
});

describe("/api/tools/video", () => {
  it("renders exactly the shot the user pressed Render on, without re-planning the script", async () => {
    // It used to re-plan the whole script on every render and pick scenes[i] from
    // the NEW plan — a different, freshly-generated shot from the one on screen.
    const res = await post({ scene: { prompt: "A red kite over dunes at noon.", seconds: 6 } });
    expect(res.status).toBe(200);
    expect(planScenes).not.toHaveBeenCalled();
    expect(createPrediction).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ prompt: "A red kite over dunes at noon.", duration: 6 }));
  });

  it("refuses shots the video model cannot render", async () => {
    for (const scene of [{ prompt: "", seconds: 5 }, { prompt: "x", seconds: 12 }, { prompt: "x", seconds: 4.5 }, { prompt: "x".repeat(1501), seconds: 5 }]) {
      expect((await post({ scene })).status).toBe(400);
    }
    expect(createPrediction).not.toHaveBeenCalled();
  });

  it("answers malformed bodies with a 400, not a crash", async () => {
    for (const body of [null, 7, "x", { scene: null }, { scene: "x" }, { script: 42 }, { narration: null }]) {
      expect((await post(body)).status).toBe(400);
    }
    expect(createPrediction).not.toHaveBeenCalled();
  });

  it("voices one narration line", async () => {
    const res = await post({ narration: "The city never sleeps." });
    expect(res.status).toBe(200);
    expect(createPrediction).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ text: "The city never sleeps." }));
    expect((await post({ narration: "x".repeat(401) })).status).toBe(400);
  });

  it("plans for free when only a script is sent", async () => {
    planScenes.mockResolvedValue({ scenes: [{ n: 1, title: "A", seconds: 5, prompt: "p", narration: "" }] });
    const res = await post({ script: "# Ep 1" });
    expect((await res.json()).scenes).toHaveLength(1);
    expect(createPrediction).not.toHaveBeenCalled();
  });
});
