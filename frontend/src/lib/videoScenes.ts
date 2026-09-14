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
}

const SYSTEM = `You are a director of photography converting a script into prompts for a text-to-video model.

Return ONLY a JSON array. Each element: { "title": string, "seconds": number, "prompt": string }.

Rules for every "prompt":
- SELF-CONTAINED. The model renders each clip with no knowledge of the others, so restate the subject's appearance, age, wardrobe, the location, time of day, weather and colour palette in full — every single time. Never write "he", "she", "they", "the same room", "continues", "again", or any other reference to another scene.
- Describe ONE continuous shot: subject + what they do + camera (angle, lens, movement) + lighting + mood + film-stock/colour grade.
- Present tense, concrete, visual. No dialogue, no on-screen text, no scene numbers, no cuts, no narration.
- 40-70 words.
- "seconds" is between 4 and 8 — these models cannot render longer in one take.

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
      return {
        n: i + 1,
        title: typeof o.title === "string" && o.title.trim() ? o.title.trim() : `Scene ${i + 1}`,
        seconds: Number.isFinite(secs) ? Math.min(Math.max(Math.round(secs), 4), 8) : 5,
        prompt,
      };
    })
    .filter((s): s is Scene => s !== null)
    .slice(0, 12)
    .map((s, i) => ({ ...s, n: i + 1 }));

  if (!scenes.length) throw new Error("Could not read a shot list from the script");
  return scenes;
}

export async function planScenes(script: string): Promise<{ scenes: Scene[]; provider: string }> {
  const out = await llmCascade({
    system: SYSTEM,
    messages: [{ role: "user", content: script.slice(0, 12000) }],
    maxTokens: 2000,
    temperature: 0.6,
    stage: "video:scenes",
  });
  return { scenes: parseScenes(out.text), provider: out.provider };
}
