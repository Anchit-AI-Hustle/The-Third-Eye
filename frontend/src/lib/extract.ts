import { llmCascade } from "@/lib/llmCascade";
import { parseLlmJson } from "@/lib/llmJson";
import { GROWTH_PILLARS, type ExtractedTask } from "@/lib/tasks";

// Ported from Personal-AI-OS ai/prompts.py + ai/extractor.py, with no assumed
// employer: every account gets rules about its own work and life. The
// anti-fake-identifier rule is load-bearing.

const USER_CONTEXT = `You are the user's chief-of-staff AI.
Office work means the user's job: their employer, clients, colleagues and professional projects.

HARD RULES:
- Extract actions the user personally has to take, for work or personal life.
  Receipts, newsletters, promotions and auto-generated mail → return empty tasks.
- Never invent people. Never emit opaque identifiers (users/12345, UUIDs,
  "(unknown)") as an owner; set owner to null instead.`;

const TASK_SHAPE_HINT = `
Each task is an object:
{
  "task_heading": "specific imperative, <= 70 chars",
  "task_description": "full context - SKU/customer/campaign/geo/amount, <= 180 chars",
  "rationale": "why this matters",
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
Each task also has "workspace": "office" for work, "personal" for everything else.
is_actionable is true ONLY when there is a concrete required action for the user.
Newsletters, receipts, digests, mass announcements, cold outreach, FYIs, and
auto-replies are NOT actionable → is_actionable=false, tasks=[].`;

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
    workspace: raw.workspace === "personal" ? "personal" : raw.workspace === "office" ? "office" : null,
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
      background: true,
    });
    return parseLlmJson(out.text).value;
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
  email: string; sender: string; subject: string; receivedAt: string; body: string;
}): Promise<ExtractionResult | null> {
  const user = `From: ${input.sender}\nSubject: ${input.subject}\nReceived: ${input.receivedAt}\n\n${input.body.slice(0, 6000)}`;
  const parsed = await runExtraction(EMAIL_SYSTEM_PROMPT, user, 1000);
  // null = the model couldn't be reached, which is not the same as "nothing actionable".
  if (!parsed) return null;
  const rawTasks = Array.isArray(parsed.tasks) ? (parsed.tasks as Record<string, unknown>[]) : [];
  const tasks = rawTasks.map((t) => coerceTask(t, input.sender)).filter((t): t is ExtractedTask => !!t);
  return { summary: str(parsed.summary), isActionable: parsed.is_actionable === true, tasks };
}
