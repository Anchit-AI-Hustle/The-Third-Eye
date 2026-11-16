// A lighter chat request for providers with small per-request caps (free tiers: Groq allows
// ~8K tokens per minute per model). The full JARVIS request is ~14-17K tokens (a 15K-character
// persona, a full app list and ~100 tool schemas) before the user says a word, so on those caps it
// can never fit. This keeps the rules that matter, attaches only the tools the message points at,
// and says so in the prompt, so a missing tool is reported rather than faked.

/** Sections of the persona that are always kept; the rest are heavy, tool-specific guidance. */
const KEEP = /^(Character|Language|Intelligence|This turn is the only task|Honesty|Security|Formatting)\b/i;

/** Roughly the request size (tokens) one free-tier turn should stay under. */
export const COMPACT_BUDGET_TOKENS = 5000;
const TOOL_BUDGET_CHARS = 6000;   // ~1.5K tokens of tool schemas
const MAX_TOOLS = 8;
const EXTRAS_MAX_CHARS = 3500;    // memory, tasks, goals, notes
const HISTORY_TURNS = 6;
const HISTORY_CHARS = 1800;       // per past message

export function compactPersona(full: string): string {
  const parts = full.split(/\n(?=## )/);
  const head = parts[0];
  const kept = parts.slice(1).filter((p) => KEEP.test(p.replace(/^## /, "")));
  return [head, ...kept].join("\n");
}

const STOP = new Set(["the", "a", "an", "to", "of", "and", "or", "for", "my", "me", "i", "it", "is", "in", "on", "with", "that", "this", "you", "can", "please", "what", "how", "do", "be", "at", "from", "your"]);
const words = (s: string) => (s.toLowerCase().match(/[a-z]{3,}/g) ?? []).filter((w) => !STOP.has(w));

type Decl = { name: string; description?: string; parameters?: unknown };

/** The tools whose name or description share words with what the user just said, best first. */
export function selectTools<T extends Decl>(message: string, decls: T[]): T[] {
  const q = new Set(words(message));
  if (q.size === 0) return [];
  const scored = decls.map((d) => {
    const nameW = d.name.toLowerCase().split(/[_\s-]+/);
    const descW = new Set(words(d.description ?? ""));
    let score = 0;
    for (const w of q) {
      if (nameW.some((n) => n === w || (w.length > 4 && (n.startsWith(w) || w.startsWith(n) && n.length > 3)))) score += 3;
      else if (descW.has(w)) score += 1;
    }
    return { d, score };
  }).filter((x) => x.score >= 2).sort((a, b) => b.score - a.score);
  const out: T[] = [];
  let chars = 0;
  for (const { d } of scored) {
    const size = JSON.stringify(d).length;
    if (out.length >= MAX_TOOLS || chars + size > TOOL_BUDGET_CHARS) continue;
    out.push(d); chars += size;
  }
  return out;
}

export function trimHistory<T extends { content: string }>(history: T[]): T[] {
  return history.slice(-HISTORY_TURNS).map((h) => (h.content.length > HISTORY_CHARS ? { ...h, content: `${h.content.slice(0, HISTORY_CHARS)}…` } : h));
}

export function compactSystem(opts: { persona: string; today: string; extras: string; attached: string[]; totalTools: number }): string {
  // Keep both ends: the front holds the persona and mode, the back holds turn rules such as
  // "this was spoken aloud", which must survive trimming.
  const extras = opts.extras.length > EXTRAS_MAX_CHARS
    ? `${opts.extras.slice(0, 1500)}\n(some context omitted this turn)\n${opts.extras.slice(-(EXTRAS_MAX_CHARS - 1500))}`
    : opts.extras;
  const toolNote = opts.attached.length
    ? `\n\n## Lighter mode\nThis turn only ${opts.attached.length} of ${opts.totalTools} tools are attached (${opts.attached.join(", ")}). Use them when they fit. If the user needs an action that none of them can do, say plainly that you can't do it in this lighter mode and ask them to say it again as a direct request. Never pretend an action happened.`
    : `\n\n## Lighter mode\nNo tools are attached this turn. If the user asks you to take an action (send, add, open, change something), say plainly that you can't do it in this lighter mode and ask them to say it again as a direct request. Never pretend an action happened.`;
  return `${compactPersona(opts.persona)}\n\n${opts.today}${extras ? `\n\n${extras}` : ""}${toolNote}`;
}

/** A tool result longer than this is cut when the provider's per-request cap is small. */
export const TOOL_RESULT_MAX_CHARS = 3000;
export const clipToolResult = (s: string) => (s.length > TOOL_RESULT_MAX_CHARS ? `${s.slice(0, TOOL_RESULT_MAX_CHARS)}\n[result shortened to fit; ask for a narrower query for the rest]` : s);
