import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { llmCascade } from "@/lib/llmCascade";

export const runtime = "nodejs";
export const maxDuration = 30;

// Suggest / Enhance / New for any one field of any Studio form — the same
// toolbar Music Studio has, for every other tool. (Music keeps its own
// /api/tools/music/suggest, which is grounded in the genre knowledge base.)
//
// The tool and field descriptions come from the client's own form definition;
// they are prompt text written by the user's own UI, not instructions we trust.

type Action = "suggest" | "enhance" | "new";
type FieldType = "text" | "textarea" | "select";

interface Body {
  tool?: { label?: unknown; purpose?: unknown };
  field?: { name?: unknown; label?: unknown; type?: unknown; placeholder?: unknown; options?: unknown };
  value?: unknown;
  action?: unknown;
  context?: unknown;
  previous?: unknown;
}

const VALUE_MAX = 12_000;
const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

function instruction(type: FieldType, options: string[]): string {
  if (type === "select") return `Answer with exactly one of these options, copied verbatim: ${options.join(" | ")}.`;
  if (type === "textarea") return "Write the field's content in full — specific, concrete and ready to use as-is. Plain text; no headings or commentary about what you wrote.";
  return "Give one concise value on a single line.";
}

export async function POST(req: NextRequest) {
  if (!(await getServerSession(authOptions))?.user?.email) return Response.json({ error: "Not authenticated" }, { status: 401 });

  let body: Body;
  try { body = await req.json(); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!body || typeof body !== "object") return Response.json({ error: "Invalid JSON" }, { status: 400 });

  const action: Action = body.action === "enhance" || body.action === "new" ? body.action : "suggest";
  const type: FieldType = body.field?.type === "textarea" || body.field?.type === "select" ? body.field.type : "text";
  const label = str(body.field?.label, 80);
  const options = Array.isArray(body.field?.options) ? body.field.options.map((o) => str(o, 120)).filter(Boolean).slice(0, 40) : [];
  if (!label || (type === "select" && !options.length)) return Response.json({ error: "A field label (and options, for a choice) is required" }, { status: 400 });

  // Enhance replaces the whole field, so it must see the whole field: past the
  // limit it is refused rather than truncated (which silently dropped the rest).
  const raw = typeof body.value === "string" ? body.value.trim() : "";
  if (action === "enhance" && raw.length > VALUE_MAX) {
    return Response.json({ error: `Too long to enhance in one go (over ${VALUE_MAX.toLocaleString("en-IN")} characters) — enhance a part of it instead.` }, { status: 400 });
  }
  const value = raw.slice(0, VALUE_MAX);
  if (action === "enhance" && !value) return Response.json({ error: "Nothing to enhance yet — type something or use Suggest." }, { status: 400 });

  const context = body.context && typeof body.context === "object"
    ? Object.entries(body.context as Record<string, unknown>)
        .map(([k, v]) => [str(k, 60), str(v, 600)])
        .filter(([k, v]) => k && v)
        .slice(0, 20)
    : [];
  const previous = Array.isArray(body.previous) ? body.previous.map((p) => str(p, 120)).filter(Boolean).slice(-6) : [];

  const system = [
    `You fill in ONE field of the "${str(body.tool?.label, 80) || "Studio"}" form${str(body.tool?.purpose, 300) ? ` — ${str(body.tool?.purpose, 300)}` : ""}.`,
    `Field: "${label}"${str(body.field?.placeholder, 160) ? ` (hint: ${str(body.field?.placeholder, 160)})` : ""}.`,
    instruction(type, options),
    "Stay coherent with everything else already filled in on the form. Output ONLY the value — no label, no quotes, no explanation.",
  ].join("\n");
  const user = [
    context.length ? `Rest of the form:\n${context.map(([k, v]) => `- ${k}: ${v}`).join("\n")}` : "The rest of the form is empty.",
    action === "enhance" ? `Improve this value — keep its intent, make it more specific and vivid:\n${value}`
      : action === "new" ? `Give a clearly different alternative${value ? ` to: ${value}` : ""}.`
      : value ? `Suggest a better value than: ${value}` : "Suggest a strong value.",
    previous.length ? `Do not repeat: ${previous.map((p) => `"${p}"`).join(", ")}.` : "",
  ].filter(Boolean).join("\n\n");

  try {
    const out = await llmCascade({
      system, messages: [{ role: "user", content: user }],
      maxTokens: type === "textarea" ? Math.min(4000, 700 + Math.ceil(value.length / 3)) : 120,
      temperature: action === "enhance" ? 0.5 : action === "new" ? 0.95 : 0.7,
      stage: "studio:suggest",
    });
    const suggestion = normalize(out.text, type, options);
    if (!suggestion) return Response.json({ error: "No usable suggestion came back — try again." }, { status: 502 });
    return Response.json({ suggestion });
  } catch (e) {
    return Response.json({ error: `Suggestion failed: ${e instanceof Error ? e.message : "unknown"}` }, { status: 502 });
  }
}

function normalize(raw: string, type: FieldType, options: string[]): string {
  const text = raw.trim().replace(/^```[a-z]*\n?|\n?```$/gi, "").trim();
  if (type === "textarea") return text.replace(/^["“]|["”]$/g, "").trim();
  const line = text.split("\n")[0].replace(/^[\s"'“`*\-–]+|[\s"'”`*.,;:]+$/g, "").trim();
  if (type === "text") return line;
  // A choice has to land on a real option: exact first, then the longest one it mentions.
  const lower = line.toLowerCase();
  return options.find((o) => o.toLowerCase() === lower)
    ?? options.filter((o) => lower.includes(o.toLowerCase())).sort((a, b) => b.length - a.length)[0]
    ?? "";
}
