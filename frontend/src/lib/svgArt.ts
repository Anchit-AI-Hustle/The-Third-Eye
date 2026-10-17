import { llmCascade } from "@/lib/llmCascade";

// Images with no image model: the language model writes the picture as SVG
// code, which renders as a crisp vector illustration. Good for illustrations,
// icons, logos, posters and diagrams; it is not a photo. The SVG is checked so
// it can neither run code nor load anything from elsewhere.

const UNSAFE = /<script|<foreignObject|<iframe|<object|<embed|\son\w+\s*=|javascript:|(?:href|src)\s*=\s*["']\s*(?:https?:|\/\/|data:)|@import|url\(\s*["']?\s*(?:https?:|\/\/)/i;

export function sanitizeSvg(raw: string): string | null {
  const svg = raw.match(/<svg[\s\S]*<\/svg>/i)?.[0];
  if (!svg || UNSAFE.test(svg) || svg.length > 200_000) return null;
  return /\sxmlns=/.test(svg.slice(0, svg.indexOf(">"))) ? svg : svg.replace(/<svg/i, '<svg xmlns="http://www.w3.org/2000/svg"');
}

const SYSTEM = `You are an illustrator who draws in SVG code. Reply with one complete SVG and nothing else.
Rules: viewBox="0 0 1024 1024"; a full background; rich composition with gradients, layered shapes and depth; text only if asked for; no <script>, no event handlers, no external images, fonts or links.`;

export async function drawSvg(prompt: string, style?: string): Promise<string | null> {
  const out = await llmCascade({
    system: SYSTEM,
    messages: [{ role: "user", content: `${prompt}${style ? `\nStyle: ${style}` : ""}` }],
    maxTokens: 6000, temperature: 0.6, timeoutMs: 45_000, stage: "svg-art",
  });
  const svg = sanitizeSvg(out.text);
  return svg ? `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}` : null;
}
