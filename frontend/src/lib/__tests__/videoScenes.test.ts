import { afterEach, describe, expect, it, vi } from "vitest";

import { fitScenes, planScenes } from "@/lib/videoScenes";
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

describe("reel timeline", () => {
  it("has no title or end card, so a reel runs its stated length and loops", () => {
    const segs = planTimeline([{ clip: 5, voice: 0 }, { clip: 5, voice: 0 }], false);
    expect(segs.map((s) => s.kind)).toEqual(["shot", "shot"]);
    expect(segs[0].start).toBe(0);
    expect(segs.at(-1)!.end).toBe(10);
  });
});

describe("reel length", () => {
  const scene = (n: number, seconds: number, narration = "") => ({ n, title: `S${n}`, seconds, prompt: "p", narration });

  it("fits the shots to the reel's exact running time, each within 4-8 seconds", () => {
    // Shots were planned with no idea of the length asked for, so a 15-second
    // reel came out at 16+ and a 60-second one topped out near 48.
    for (const [target, shots] of [[15, [6, 6, 6]], [30, [5, 5, 5, 5, 5]], [60, [8, 8, 8, 8, 8, 8, 8, 8]], [45, [4, 4, 4, 4, 4, 4, 4, 4, 4]]] as const) {
      const fitted = fitScenes(shots.map((sec, i) => scene(i + 1, sec)), target);
      expect(fitted.reduce((t, s) => t + s.seconds, 0)).toBe(target);
      for (const s of fitted) { expect(s.seconds).toBeGreaterThanOrEqual(4); expect(s.seconds).toBeLessThanOrEqual(8); }
    }
  });

  it("drops shots the time can't hold and re-cuts each voice-over to its shot", () => {
    const fitted = fitScenes([1, 2, 3, 4, 5].map((i) => scene(i, 6, "one two three four five six seven eight nine ten eleven twelve")), 15);
    expect(fitted).toHaveLength(3);
    for (const s of fitted) expect(s.narration.split(" ").length).toBeLessThanOrEqual(Math.floor(s.seconds * 2.5));
  });

  it("tells the planner the reel's length and fits what comes back", async () => {
    reply(JSON.stringify([6, 6, 6].map((seconds, i) => ({ title: `S${i}`, seconds, prompt: "a vertical shot", narration: "" }))));
    const { scenes } = await planScenes("# Reel", 15);
    expect(mockCascade.mock.calls[0][0].system).toContain("add up to exactly 15");
    expect(scenes.reduce((t, s) => t + s.seconds, 0)).toBe(15);
  });
});

describe("undersized reel plans", () => {
  const list = (n: number) => JSON.stringify(Array.from({ length: n }, (_, i) => ({ title: `S${i}`, seconds: 8, prompt: "a vertical shot", narration: "" })));

  it("asks again when the shots can't fill the reel, and fits the second answer", async () => {
    // Six 8-second shots top out at 48 seconds; a 60-second reel came back short
    // and only showed it after every clip was paid for.
    mockCascade
      .mockResolvedValueOnce({ text: list(6), provider: "groq" } as Awaited<ReturnType<typeof llmCascade>>)
      .mockResolvedValueOnce({ text: list(9), provider: "groq" } as Awaited<ReturnType<typeof llmCascade>>);
    const { scenes } = await planScenes("# Reel", 60);
    expect(mockCascade).toHaveBeenCalledTimes(2);
    expect(mockCascade.mock.calls[1][0].messages[0].content).toContain("needs at least 8 shots");
    expect(scenes.reduce((t, s) => t + s.seconds, 0)).toBe(60);
  });

  it("refuses instead of returning a reel shorter than the one chosen", async () => {
    reply(list(5));
    await expect(planScenes("# Reel", 60)).rejects.toThrow(/too few to fill a 60-second reel/);
  });
});
