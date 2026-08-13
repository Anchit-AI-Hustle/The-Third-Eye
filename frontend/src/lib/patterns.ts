// Patterns the assistant learns live in the same durable memory store as
// anything else it is told to remember, under a `pattern:<kind>` key. The value
// carries its confidence inline so a later read can report both without a
// second table.

export const PATTERN_PREFIX = "pattern:";

export interface Pattern {
  kind: string;
  value: string;
  confidence: number;
}

const ENCODED = /^(.*) \(confidence (\d+)%\)$/;

export function encodePattern(value: string, confidence: number): string {
  return `${value} (confidence ${Math.round(confidence * 100)}%)`;
}

export function readPatterns(store: Record<string, string>): Pattern[] {
  return Object.entries(store)
    .filter(([k]) => k.startsWith(PATTERN_PREFIX))
    .map(([k, raw]) => {
      const m = raw.match(ENCODED);
      return {
        kind: k.slice(PATTERN_PREFIX.length),
        value: m ? m[1] : raw,
        confidence: m ? Number(m[2]) / 100 : 1,
      };
    })
    .sort((a, b) => b.confidence - a.confidence || a.kind.localeCompare(b.kind));
}

function render(rows: Pattern[]): string {
  return rows.map((p) => `- **${p.kind}**: ${p.value} _(${Math.round(p.confidence * 100)}% confidence)_`).join("\n");
}

export function getInsights(category: string, store: Record<string, string>): string {
  const patterns = readPatterns(store);
  const other = Object.entries(store).filter(([k]) => !k.startsWith(PATTERN_PREFIX));
  const lines: string[] = [];

  if (category === "all" || category === "habits") {
    const rows = patterns.filter((p) => p.kind.startsWith("habit"));
    lines.push(`### Detected Habits\n${rows.length ? render(rows) : "- Nothing recorded yet. I log a habit when you tell me one or I notice it repeat."}`);
  }
  if (category === "all" || category === "patterns") {
    const rows = patterns.filter((p) => !p.kind.startsWith("habit") && !p.kind.startsWith("preference"));
    lines.push(`### Patterns\n${rows.length ? render(rows) : "- No patterns recorded yet."}`);
  }
  if (category === "all" || category === "preferences") {
    const rows = patterns.filter((p) => p.kind.startsWith("preference"));
    lines.push(`### Preferences\n${rows.length ? render(rows) : "- No preferences recorded yet. Tell me what you like and I'll remember."}`);
  }
  if (category === "all" || category === "activity") {
    lines.push(`### Everything else I remember\n${other.length ? other.map(([k, v]) => `- **${k}**: ${v}`).join("\n") : "- Nothing stored yet."}`);
  }
  return lines.join("\n\n");
}

export function getHabits(minConfidence: number, store: Record<string, string>): string {
  const rows = readPatterns(store).filter((p) => p.kind.startsWith("habit") && p.confidence >= minConfidence);
  if (!rows.length) {
    return `### Your Habits\n\nNothing recorded at or above ${Math.round(minConfidence * 100)}% confidence yet. I record a habit when you tell me one, or when you ask me to note a routine you've repeated.`;
  }
  const list = rows
    .map((p) => `- **${p.kind.replace(/^habit[:.]?/, "") || p.kind}**: ${p.value} _(${Math.round(p.confidence * 100)}%)_`)
    .join("\n");
  return `### Your Habits\n\n${list}`;
}

// Writes through to the caller's memory store, which the chat route persists to
// jarvis_memory at the end of the turn.
export function learnPattern(
  kind: string,
  value: string,
  confidence: number,
  store: Record<string, string>,
): string {
  if (!kind || !value) return "I need both a pattern category (kind) and a value to record.";
  store[`${PATTERN_PREFIX}${kind}`] = encodePattern(value, confidence);
  return `### Pattern Recorded\n\n- **Category**: ${kind}\n- **Value**: ${value}\n- **Confidence**: ${Math.round(confidence * 100)}%\n\nSaved to your profile — it'll be in my context on every future conversation, on any device.`;
}
