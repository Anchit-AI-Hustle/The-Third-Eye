import Anthropic from "@anthropic-ai/sdk";
import { calculators } from "@/lib/calculators/data";
import { SITE_URL } from "@/lib/site";
import { AUTOMATION } from "./config";
import type { ContentIdea, PostDraft } from "./types";

// Evergreen finance tips — never go stale, same durability principle as the
// calculators themselves.
const TIPS: string[] = [
  "Clearing a 9% loan is a guaranteed, tax-free 9% return. No fund offers that with certainty.",
  "A step-up SIP that rises 10% a year usually beats chasing a 2% higher return — and costs nothing today.",
  "The minimum credit card payment is engineered to keep you in debt, not get you out of it.",
  "Your emergency fund isn't an investment. Its only job is being there, in full, on the worst day of your year.",
  "Inflation is the quiet tax: at 6% a year, your money's buying power roughly halves in 12 years.",
  "Time in the market beats timing it. A 20-year SIP often finishes twice as large as a 10-year one at double the amount.",
  "Prepay the tenure, not the EMI. Keeping the EMI and shortening the loan saves far more interest.",
  "Real return is your return minus inflation. Earning 7% while inflation runs 6% means you're barely standing still.",
];

export function calculatorLink(slug: string): string {
  return `${SITE_URL}/calculators/${slug}`;
}

/** The full rotation of post ideas: one spotlight per calculator, plus tips. */
export function buildIdeas(): ContentIdea[] {
  const spotlights: ContentIdea[] = calculators.map((c) => ({
    kind: "calculator-spotlight",
    calculatorSlug: c.slug,
    link: calculatorLink(c.slug),
    prompt:
      `Write a punchy social post (max 240 characters, 1–2 short sentences) about the "${c.h1}". ` +
      `Lead with one concrete, slightly surprising insight a person would learn from it, then invite them to try the free calculator. ` +
      `Plain, confident, non-preachy. Do NOT include any link or hashtags — those are appended separately. ` +
      `Context: ${c.metaDescription}`,
    fallback: `${c.h1} — ${c.metaDescription} Try it free:`,
  }));

  const tips: ContentIdea[] = TIPS.map((t) => ({
    kind: "money-tip",
    link: `${SITE_URL}/calculators`,
    prompt:
      `Rewrite this personal-finance tip as a punchy social post (max 240 characters), concrete and non-preachy, ` +
      `keeping the number if there is one: "${t}". No hashtags or links.`,
    fallback: t,
  }));

  return [...spotlights, ...tips];
}

/** Deterministic pick so a given day always yields the same post (idempotent). */
export function pickIdea(seed: number): ContentIdea {
  const ideas = buildIdeas();
  const i = ((seed % ideas.length) + ideas.length) % ideas.length;
  return ideas[i];
}

/** Generate the post text via Claude, falling back to the template if no key. */
export async function generatePost(idea: ContentIdea): Promise<PostDraft> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  let text = idea.fallback;

  if (apiKey) {
    try {
      const client = new Anthropic({ apiKey });
      const msg = await client.messages.create({
        model: AUTOMATION.model,
        max_tokens: 300,
        messages: [{ role: "user", content: idea.prompt }],
      });
      const out = msg.content
        .map((b) => (b.type === "text" ? b.text : ""))
        .join("")
        .trim();
      if (out) text = out;
    } catch {
      // Any API error → keep the deterministic fallback. Posting never blocks
      // on the LLM being reachable.
    }
  }

  return {
    text,
    link: idea.link,
    hashtags: idea.kind === "calculator-spotlight" ? AUTOMATION.hashtags : AUTOMATION.tipHashtags,
    calculatorSlug: idea.calculatorSlug,
  };
}
