import { llmCascade } from "@/lib/llmCascade";

// Turns a Video Studio script (the Markdown the `video` tool writes) into a shot
// list a text-to-video model can actually render.
//
// The key constraint: these models have no memory between calls. Each clip is
// generated in isolation, so every scene prompt has to re-state the subject,
// wardrobe, setting and look from scratch — "she walks back in" renders a
// different person. The system prompt below enforces that self-containment,
// which is most of what separates a usable shot list from a useless one.

export interface Scene {
  n: number;
  title: string;
  seconds: number;
  prompt: string;
  /** Voice-over spoken over this shot in the assembled episode; "" for none. */
  narration: string;
}

// ~2.5 spoken words a second. A line longer than its shot holds the last frame
// until the voice finishes, so the budget is what keeps the cut on the picture.
export const narrationBudget = (seconds: number) => Math.floor(seconds * 2.5);

const SYSTEM = `You are a director of photography converting a script into prompts for a text-to-video model.

Return ONLY a JSON array. Each element: { "title": string, "seconds": number, "prompt": string, "narration": string }.

Rules for every "prompt":
- SELF-CONTAINED. The model renders each clip with no knowledge of the others, so restate the subject's appearance, age, wardrobe, the location, time of day, weather and colour palette in full — every single time. Never write "he", "she", "they", "the same room", "continues", "again", or any other reference to another scene.
- Describe ONE continuous shot: subject + what they do + camera (angle, lens, movement) + lighting + mood + film-stock/colour grade.
- Present tense, concrete, visual. No dialogue, no on-screen text, no scene numbers, no cuts, no narration (that goes in "narration").
- 40-70 words.
- "seconds" is between 4 and 8 — these models cannot render longer in one take.

Rules for every "narration":
- The voice-over line heard over that shot in the finished episode, taken from or faithful to the script's dialogue/narration for that beat.
- At most 2.5 words per second of the shot (a 6-second shot gets 15 words at most). Plain spoken English, no stage directions, no speaker names. Use "" when the shot should play in silence.

Cover the script's beats in order. Prefer 4-6 scenes unless the script clearly needs more.
No markdown fences, no commentary — the raw JSON array only.`;

function parseScenes(text: string): Scene[] {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start < 0 || end <= start) throw new Error("Could not read a shot list from the script");
  let raw: unknown;
  try { raw = JSON.parse(text.slice(start, end + 1)); }
  catch { throw new Error("Could not read a shot list from the script"); }
  if (!Array.isArray(raw)) throw new Error("Could not read a shot list from the script");

  const scenes = raw
    .map((s, i): Scene | null => {
      const o = s as Record<string, unknown>;
      const prompt = typeof o.prompt === "string" ? o.prompt.trim() : "";
      if (!prompt) return null;
      const secs = Number(o.seconds);
      const seconds = Number.isFinite(secs) ? Math.min(Math.max(Math.round(secs), 4), 8) : 5;
      const words = typeof o.narration === "string" ? o.narration.trim().split(/\s+/).filter(Boolean) : [];
      return {
        n: i + 1,
        title: typeof o.title === "string" && o.title.trim() ? o.title.trim() : `Scene ${i + 1}`,
        seconds,
        prompt,
        narration: words.slice(0, narrationBudget(seconds)).join(" "),
      };
    })
    .filter((s): s is Scene => s !== null)
    .slice(0, 12)
    .map((s, i) => ({ ...s, n: i + 1 }));

  if (!scenes.length) throw new Error("Could not read a shot list from the script");
  return scenes;
}

/**
 * Fit a shot list to an exact running time — a reel is 15, 30, 45 or 60 seconds.
 * Each shot stays within what the model renders (4-8 s); shots past what the
 * time can hold are dropped from the end, and each voice-over is re-cut to its
 * shot's new length.
 */
export function fitScenes(scenes: Scene[], target: number): Scene[] {
  const kept = scenes.slice(0, Math.max(1, Math.floor(target / 4)));
  const sum = kept.reduce((t, s) => t + s.seconds, 0);
  const secs = kept.map((s) => Math.min(8, Math.max(4, Math.round((s.seconds * target) / sum))));
  let diff = target - secs.reduce((t, x) => t + x, 0);
  for (let pass = 0; diff !== 0 && pass < 8; pass++) {
    for (let i = 0; i < secs.length && diff !== 0; i++) {
      if (diff > 0 && secs[i] < 8) { secs[i]++; diff--; }
      else if (diff < 0 && secs[i] > 4) { secs[i]--; diff++; }
    }
  }
  return kept.map((s, i) => ({
    ...s,
    seconds: secs[i],
    narration: s.narration.split(/\s+/).filter(Boolean).slice(0, narrationBudget(secs[i])).join(" "),
  }));
}

export async function planScenes(script: string, seconds?: number): Promise<{ scenes: Scene[]; provider: string }> {
  const out = await llmCascade({
    system: seconds
      ? `${SYSTEM}\n\nThis is a ${seconds}-second reel: the shots' "seconds" must add up to exactly ${seconds}, so use ${Math.ceil(seconds / 8)}-${Math.floor(seconds / 4)} shots, framed vertically (9:16).`
      : SYSTEM,
    messages: [{ role: "user", content: script.slice(0, 12000) }],
    maxTokens: 2000,
    temperature: 0.6,
    stage: "video:scenes",
  });
  const scenes = parseScenes(out.text);
  return { scenes: seconds ? fitScenes(scenes, seconds) : scenes, provider: out.provider };
}
