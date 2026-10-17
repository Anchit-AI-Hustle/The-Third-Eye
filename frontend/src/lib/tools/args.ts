// Arguments a model sends are checked against the tool's declaration before the
// tool runs, so a malformed call is reported back instead of acting on guesses.

type Schema = { type?: string; enum?: unknown[]; properties?: Record<string, Schema>; required?: string[] };
type Decl = { name: string; parameters?: Schema };

export function parseToolArgs(raw: string | undefined): { args: Record<string, unknown>; error?: string } {
  if (!raw?.trim()) return { args: {} };
  try {
    const v = JSON.parse(raw);
    if (v && typeof v === "object" && !Array.isArray(v)) return { args: v };
    return { args: {}, error: "arguments must be a JSON object" };
  } catch {
    return { args: {}, error: "arguments were not valid JSON" };
  }
}

export function checkArgs(decl: Decl | undefined, args: Record<string, unknown>): string | null {
  const p = decl?.parameters;
  if (!p) return null;
  for (const k of p.required ?? []) {
    const v = args[k];
    // Built-in declarations use Gemini's upper-case types; an MCP schema may
    // accept an empty string, so only ours treat "" as missing.
    if (v === undefined || v === null || (v === "" && p.properties?.[k]?.type === "STRING")) return `missing required argument "${k}"`;
  }
  for (const [k, s] of Object.entries(p.properties ?? {})) {
    const v = args[k];
    if (v === undefined || v === null) continue;
    if (s.enum && !s.enum.some((e) => String(e) === String(v))) return `"${k}" must be one of ${s.enum.join(", ")}`;
    if ((s.type === "NUMBER" || s.type === "INTEGER") && !Number.isFinite(Number(v))) return `"${k}" must be a number`;
  }
  return null;
}
