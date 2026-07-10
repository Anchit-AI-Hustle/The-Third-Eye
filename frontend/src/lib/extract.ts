import { llmCascade } from "@/lib/llmCascade";
import { GROWTH_PILLARS, type ExtractedTask } from "@/lib/tasks";

// Ported from Personal-AI-OS ai/prompts.py + ai/extractor.py. The Vahdam-only
// gate and anti-fake-identifier rule are load-bearing — keep them verbatim.

const USER_CONTEXT = `
You are the chief-of-staff AI for Anchit Tandon, who leads D2C growth at Vahdam
India (a premium tea D2C brand). Direct team: Aman, Manisha, Arihant.

HARD RULES:
- Only extract Vahdam work. Personal matters (banking, family, food delivery,
  receipts, newsletters, promotions, auto-generated mail) → return empty tasks.
- Never invent people. Never emit opaque identifiers (users/12345, UUIDs,
  "(unknown)") as an owner — set owner to null instead.
- Weight growth levers: acquisition/CAC, repeat/LTV/subscription, CRO, AOV,
  marketplace ranking + ads, promotions/gifting, retention (email/SMS/WhatsApp/
  Klaviyo), influencer/PR, ops issues blocking sales, margin.
`.trim();

const TASK_SHAPE_HINT = `
Each task is an object:
{
  "task_heading": "specific imperative, <= 70 chars",
  "task_description": "full context — SKU/customer/campaign/geo/amount, <= 180 chars",
  "rationale": "why this matters (tie to a revenue lever)",
  "growth_pillar": one of ${JSON.stringify(GROWTH_PILLARS)},
  "deadline": "ISO date, natural-language phrase, or null",
  "urgency": "Low" | "Medium" | "High" | "Critical",
  "owner": "real person name or null",
  "owner_contact": "email/phone or null"
}
Reject vague headings like "Follow up" or "Reply to email".
`.trim();

const EMAIL_SYSTEM_PROMPT = `${USER_CONTEXT}

You are analysing a single email. Return STRICT JSON:
{"is_actionable": bool, "summary": string, "tasks": [ ... ]}
${TASK_SHAPE_HINT}
is_actionable is true ONLY when there is a concrete required action for Anchit.
Newsletters, receipts, digests, mass announcements, cold outreach, FYIs, and
auto-replies are NOT actionable → is_actionable=false, tasks=[].`;

const MEETING_SYSTEM_PROMPT = `${USER_CONTEXT}

You are analysing a short transcript chunk (may mix Hindi + English). Translate
Hindi to English but keep names verbatim. Return STRICT JSON:
{"summary": string, "tasks": [ ... ]}
${TASK_SHAPE_HINT}
ANTI-HALLUCINATION: emit a task ONLY on an explicit verbatim commitment or
assignment — never a mere mention. Never attribute a task to a named person
without a verbatim same-utterance assignment. On garbled/near-silent/repetitive
audio return tasks=[] and an honest "transcript unclear" summary.`;

function parseJsonBlock(text: string): Record<string, unknown> {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : (text.match(/\{[\s\S]*\}/)?.[0] ?? "");
  if (!candidate) throw new Error("no JSON in LLM output");
  return JSON.parse(candidate) as Record<string, unknown>;
}

function str(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s === "" ? null : s;
}

function normalizeGrowthPillar(v: unknown): string {
  const s = (str(v) || "").toLowerCase();
  const hit = GROWTH_PILLARS.find((p) => p.toLowerCase() === s);
  return hit ?? "Other";
}

function normalizeUrgency(v: unknown): string {
  const s = (str(v) || "").toLowerCase();
  if (["low", "medium", "high", "critical"].includes(s)) return s[0].toUpperCase() + s.slice(1);
  return "Medium";
}

function coerceTask(raw: Record<string, unknown>, defaultOwner?: string | null): ExtractedTask | null {
  const heading = str(raw.task_heading) ?? str(raw.task);
  if (!heading) return null;
  return {
    taskHeading: heading,
    taskDescription: str(raw.task_description) ?? str(raw.description),
    rationale: str(raw.rationale) ?? str(raw.why),
    growthPillar: normalizeGrowthPillar(raw.growth_pillar ?? raw.pillar ?? raw.category),
    deadline: str(raw.deadline),
    urgency: normalizeUrgency(raw.urgency),
    owner: str(raw.owner) ?? str(raw.spoc) ?? defaultOwner ?? null,
    ownerContact: str(raw.owner_contact) ?? str(raw.spoc_contact) ?? str(raw.contact),
  };
}

async function runExtraction(system: string, user: string, maxTokens: number): Promise<Record<string, unknown> | null> {
  try {
    const out = await llmCascade({
      system,
      messages: [{ role: "user", content: user }],
      jsonMode: true,
      maxTokens,
      temperature: 0.1,
    });
    return parseJsonBlock(out.text);
  } catch (e) {
    console.error("extraction failed:", e);
    return null;
  }
}

export interface ExtractionResult {
  summary: string | null;
  isActionable: boolean;
  tasks: ExtractedTask[];
}

export async function extractEmailTasks(input: {
  sender: string; subject: string; receivedAt: string; body: string;
}): Promise<ExtractionResult> {
  const user = `From: ${input.sender}\nSubject: ${input.subject}\nReceived: ${input.receivedAt}\n\n${input.body.slice(0, 6000)}`;
  const parsed = await runExtraction(EMAIL_SYSTEM_PROMPT, user, 1000);
  if (!parsed) return { summary: null, isActionable: false, tasks: [] };
  const rawTasks = Array.isArray(parsed.tasks) ? (parsed.tasks as Record<string, unknown>[]) : [];
  const tasks = rawTasks.map((t) => coerceTask(t, input.sender)).filter((t): t is ExtractedTask => !!t);
  return { summary: str(parsed.summary), isActionable: parsed.is_actionable === true, tasks };
}

export async function extractMeetingTasks(input: {
  startedAt: string; transcript: string; defaultOwner?: string | null;
}): Promise<ExtractionResult> {
  const user = `Started: ${input.startedAt}\n\nTranscript:\n${input.transcript.slice(0, 16000)}`;
  const parsed = await runExtraction(MEETING_SYSTEM_PROMPT, user, 2000);
  if (!parsed) return { summary: null, isActionable: false, tasks: [] };
  const rawTasks = Array.isArray(parsed.tasks) ? (parsed.tasks as Record<string, unknown>[]) : [];
  const tasks = rawTasks.map((t) => coerceTask(t, input.defaultOwner ?? null)).filter((t): t is ExtractedTask => !!t);
  return { summary: str(parsed.summary), isActionable: tasks.length > 0, tasks };
}
