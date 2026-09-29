import { afterEach, describe, expect, it, vi } from "vitest";

import { planScenes } from "@/lib/videoScenes";
import { canvasSize, coverFit, planTimeline } from "@/lib/episodeVideo";
import { videoUrlFrom } from "@/lib/replicate";

vi.mock("@/lib/llmCascade", () => ({
  llmCascade: vi.fn(),
}));

import { llmCascade } from "@/lib/llmCascade";
const mockCascade = vi.mocked(llmCascade);

function reply(text: string) {
  mockCascade.mockResolvedValue({ text, provider: "groq" } as Awaited<ReturnType<typeof llmCascade>>);
}

afterEach(() => vi.clearAllMocks());

describe("planScenes", () => {
  it("parses a shot list and clamps clip length to what video models can render", async () => {
    reply(JSON.stringify([
      { title: "Neon alley", seconds: 6, prompt: "A woman in a red coat walks down a rain-slick neon alley…" },
      { title: "Rooftop", seconds: 30, prompt: "Wide drone shot rising over a rain-soaked city rooftop…" },
      { title: "Close", seconds: 1, prompt: "Extreme close-up on a cracked wristwatch face…" },
    ]));

    const { scenes } = await planScenes("# The Midnight Circuit\n\nEpisode 1 …");
    expect(scenes.map((s) => s.seconds)).toEqual([6, 8, 4]);
    expect(scenes.map((s) => s.n)).toEqual([1, 2, 3]);
    expect(scenes[0].title).toBe("Neon alley");
  });

  it("recovers a JSON array wrapped in prose or fences", async () => {
    reply('Here is the shot list:\n```json\n[{"title":"A","seconds":5,"prompt":"A lone lighthouse…"}]\n```\nEnjoy.');
    const { scenes } = await planScenes("script");
    expect(scenes).toHaveLength(1);
    expect(scenes[0].prompt).toBe("A lone lighthouse…");
  });

  it("drops entries with no prompt rather than rendering an empty clip", async () => {
    reply(JSON.stringify([{ title: "Empty", seconds: 5 }, { title: "Real", seconds: 5, prompt: "A red balloon…" }]));
    const { scenes } = await planScenes("script");
    expect(scenes).toHaveLength(1);
    expect(scenes[0].n).toBe(1);
  });

  it("keeps each voice-over within what its shot can carry", async () => {
    const long = Array.from({ length: 40 }, (_, i) => `w${i}`).join(" ");
    reply(JSON.stringify([
      { title: "A", seconds: 4, prompt: "A lighthouse at dusk…", narration: long },
      { title: "B", seconds: 6, prompt: "A harbour at dawn…", narration: "  The tide turns.  " },
      { title: "C", seconds: 5, prompt: "An empty pier…" },
    ]));
    const { scenes } = await planScenes("script");
    expect(scenes[0].narration.split(" ")).toHaveLength(10);
    expect(scenes[1].narration).toBe("The tide turns.");
    expect(scenes[2].narration).toBe("");
  });

  it("throws when the model returns no usable list", async () => {
    reply("I can't help with that.");
    await expect(planScenes("script")).rejects.toThrow(/shot list/i);
  });
});

describe("videoUrlFrom", () => {
  it("normalizes the shapes Replicate video models return", () => {
    expect(videoUrlFrom("https://x/v.mp4")).toBe("https://x/v.mp4");
    expect(videoUrlFrom(["https://x/v.mp4"])).toBe("https://x/v.mp4");
    expect(videoUrlFrom({ video: "https://x/v.mp4" })).toBe("https://x/v.mp4");
    expect(videoUrlFrom({ output: "https://x/v.mp4" })).toBe("https://x/v.mp4");
    expect(videoUrlFrom(null)).toBeNull();
  });
});

describe("planTimeline", () => {
  it("opens on a title card, plays shots in order, and closes on an end card", () => {
    const segs = planTimeline([{ clip: 5, voice: 0 }, { clip: 6, voice: 3 }]);
    expect(segs.map((s) => [s.kind, s.start, s.end])).toEqual([
      ["title", 0, 3],
      ["shot", 3, 8],
      ["shot", 8, 14],
      ["end", 14, 16],
    ]);
  });

  it("holds a shot when its voice-over runs longer than the clip", () => {
    const [, shot, end] = planTimeline([{ clip: 4, voice: 5 }]);
    expect(shot.end - shot.start).toBeCloseTo(5.4);
    expect(end.start).toBeCloseTo(shot.end);
  });
});

describe("reel framing", () => {
  it("records reels upright and crops a landscape clip to fill the frame", () => {
    expect(canvasSize("9:16")).toEqual({ W: 720, H: 1280 });
    const f = coverFit(1280, 720, 720, 1280);
    expect(f.h).toBe(1280);
    expect(f.w).toBeGreaterThan(720);
    expect(f.x).toBeCloseTo((720 - f.w) / 2);
    expect(coverFit(1280, 720, 1280, 720)).toEqual({ x: 0, y: 0, w: 1280, h: 720 });
  });
});
