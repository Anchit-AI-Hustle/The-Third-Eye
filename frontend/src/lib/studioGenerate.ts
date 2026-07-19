import { llmCascade } from "@/lib/llmCascade";
import { getTool, type OutputFormat } from "@/lib/studioTools";

// Shared Studio generation — used by the /api/tools/generate route (interactive
// workbench) and by the assistant's create_asset tool, so both produce
// identical output from one source of truth.

const BRAND = "The default brand context is Vahdam India (premium D2C teas & wellness) unless the brief says otherwise.";

export function studioSystemPrompt(toolId: string, mode?: string): string {
  const modeLine = mode ? `\nThe operator is in ${mode} mode; keep the output consistent with that context.` : "";
  switch (toolId) {
    case "landing":
      return `You are a senior conversion-focused landing-page engineer and copywriter. ${BRAND}${modeLine}
Produce ONE complete, self-contained, responsive HTML document for a landing page:
- Full <!doctype html> … </html>, all CSS in a single <style> tag, no external files or frameworks.
- Sections: sticky header, hero (headline + subhead + primary CTA), benefits/features (3-4), social proof, an FAQ or objection-handling block, and a footer.
- Modern, accessible, mobile-first. Use system fonts. Use tasteful colour and whitespace. Use placeholder image blocks (coloured divs with a label) rather than external image URLs.
- Persuasive, specific copy grounded in the brief — no lorem ipsum.
Return ONLY the raw HTML. No markdown fences, no commentary.`;
    case "mailer":
      return `You are an expert email developer and D2C lifecycle copywriter. ${BRAND}${modeLine}
Produce ONE complete, email-client-safe HTML mailer:
- Table-based layout (<table role="presentation">), max-width 600px, centered, with ALL styles INLINE (keep it robust in Gmail/Outlook).
- Structure: preheader (hidden), logo/brand bar, hero headline + hero product block, body copy, a bold CTA button (bulletproof padded table cell), secondary content, footer with unsubscribe placeholder.
- Use placeholder coloured cells for imagery, not external URLs. Web-safe fonts only.
- Include a suggested subject line and preheader as HTML comments at the very top.
Return ONLY the raw HTML. No markdown fences, no commentary.`;
    case "lifecycle":
      return `You are a principal CRM / lifecycle-marketing strategist. ${BRAND}${modeLine}
Design a concrete, actionable customer-lifecycle program as clean Markdown:
- Start with a one-line objective and the key KPI(s).
- A stage-by-stage plan (Acquisition → Onboarding → Activation → Retention → Win-back as relevant). For EACH stage: goal, trigger/timing, channel(s), the actual message/offer angle, and the success metric.
- A suggested cadence table (stage · channel · timing · message).
- 3-5 experiments to run next, ranked by impact/effort.
Be specific and grounded in the brief. Return well-structured Markdown only.`;
    case "creative":
      return `You are a versatile creative writer and music-concept collaborator.${modeLine}
Follow the requested output format exactly:
- "Song lyrics": full lyrics with [Verse]/[Chorus]/[Bridge] structure and a short title.
- "Music-gen prompt (Suno/Udio)": a compact, richly-descriptive one-paragraph style prompt (genre, instrumentation, tempo/BPM, mood, vocal style) PLUS a short lyric snippet — ready to paste into a music-generation tool.
- "Poem": a titled poem matching the requested vibe.
- "Social caption set": 5 distinct captions with fitting emoji and 3-5 hashtags each.
Return polished Markdown only. No preamble.`;
    default:
      return "You are a helpful assistant. Return well-structured output.";
  }
}

export function studioUserContent(inputs: Record<string, string>): string {
  return Object.entries(inputs)
    .filter(([, v]) => typeof v === "string" && v.trim())
    .map(([k, v]) => `${k}: ${v.trim()}`)
    .join("\n");
}

// Models sometimes wrap output in ```html / ``` fences despite instructions.
export function stripFences(s: string): string {
  const t = s.trim();
  const m = t.match(/^```[a-zA-Z]*\n([\s\S]*?)\n```$/);
  return (m ? m[1] : t).trim();
}

export interface StudioResult {
  output: string;
  format: OutputFormat;
  provider: string;
}

/** Generate a Studio asset. Throws on validation error or total provider failure. */
export async function generateStudio(
  toolId: string,
  inputs: Record<string, string>,
  mode?: string,
): Promise<StudioResult> {
  const tool = getTool(toolId);
  if (!tool) throw new Error("Unknown tool");
  const missing = tool.fields.filter((f) => f.required && !inputs[f.name]?.trim());
  if (missing.length) throw new Error(`Missing: ${missing.map((f) => f.label).join(", ")}`);

  const out = await llmCascade({
    system: studioSystemPrompt(tool.id, mode),
    messages: [{ role: "user", content: studioUserContent(inputs) }],
    maxTokens: tool.format === "html" ? 4000 : 2000,
    temperature: 0.7,
    stage: `studio:${tool.id}`,
  });
  return { output: stripFences(out.text), format: tool.format, provider: out.provider };
}
