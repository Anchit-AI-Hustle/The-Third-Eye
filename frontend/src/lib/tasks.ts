import { createHash, randomUUID } from "crypto";
import { getAdminSupabase } from "@/lib/serverSupabase";

// Ported from Personal-AI-OS services/task_service.py + database/db.py.
// The "same task" rule (normalizeHeading) and two-line dedup are load-bearing:
// they merge cross-source mentions of the same work into one row instead of
// creating duplicates.

export const GROWTH_PILLARS = [
  "Acquisition",
  "Conversion",
  "AOV",
  "Retention",
  "Marketplace",
  "Operations",
  "Brand & Content",
  "Margin",
  "Team & Process",
  "Other",
] as const;

export type Urgency = "Low" | "Medium" | "High" | "Critical";

export interface ExtractedTask {
  taskHeading: string;
  taskDescription?: string | null;
  rationale?: string | null;
  growthPillar?: string | null;
  deadline?: string | null;
  urgency?: string | null;
  owner?: string | null; // SPOC
  ownerContact?: string | null;
}

// ─── normalization ───────────────────────────────────────────────────────────

const VERB_SYNONYMS: Record<string, string[]> = {
  send: ["share", "deliver", "forward", "provide", "submit", "give", "hand over", "pass"],
  review: ["audit", "go through", "look at", "examine", "verify", "validate", "confirm"],
  create: ["build", "make", "produce", "draft", "design", "set up", "setup", "establish"],
  update: ["refresh", "edit", "modify", "revise", "adjust", "tweak", "change"],
  "follow up": ["chase", "ping", "remind", "circle back", "check on", "check in"],
  finalize: ["finalise", "lock", "close", "wrap up", "sign off"],
  fix: ["resolve", "repair", "address", "troubleshoot"],
  schedule: ["book", "arrange", "set up a meeting", "plan"],
};

const STOPWORDS = new Set([
  "the", "a", "an", "for", "to", "of", "on", "with", "in", "at", "from", "by",
  "and", "or", "is", "are", "be", "this", "that", "these", "those", "into",
  "onto", "via", "about", "regarding", "re", "around",
]);

const PLURAL_EXCEPTIONS = new Set([
  "ads", "us", "ios", "css", "kpis", "sms", "aws", "ops", "status", "focus",
  "business", "analysis", "access", "process", "address",
]);

function depluralise(word: string): string {
  if (word.length < 4) return word;
  if (PLURAL_EXCEPTIONS.has(word)) return word;
  if (/(us|is|os|as)$/.test(word)) return word;
  if (word.endsWith("ies")) return word.slice(0, -3) + "y";
  if (word.endsWith("ses")) return word.slice(0, -2);
  if (word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

function applyVerbSynonyms(tokens: string[]): string[] {
  if (tokens.length === 0) return tokens;
  const bigram = tokens.slice(0, 2).join(" ");
  const unigram = tokens[0];
  for (const [canonical, aliases] of Object.entries(VERB_SYNONYMS)) {
    if (canonical.includes(" ")) {
      if (bigram === canonical || aliases.includes(bigram)) {
        return [...canonical.split(" "), ...tokens.slice(2)];
      }
    }
  }
  for (const [canonical, aliases] of Object.entries(VERB_SYNONYMS)) {
    if (unigram === canonical || aliases.includes(unigram)) {
      return [canonical, ...tokens.slice(1)];
    }
  }
  return tokens;
}

/** Canonicalize a task heading into a merge key (see task_service.normalize_heading). */
export function normalizeHeading(heading: string): string {
  const cleaned = (heading || "").toLowerCase().replace(/[^\w\s]+/g, " ").replace(/\s+/g, " ").trim();
  if (!cleaned) return "";
  let tokens = cleaned.split(" ");
  tokens = applyVerbSynonyms(tokens);
  tokens = tokens.filter((t) => !STOPWORDS.has(t)).map(depluralise);
  return tokens.join(" ").trim();
}

const FAKE_ID = /^(users?\/|user-|u0)|^\(unknown\)$|^[0-9a-f]{8}-[0-9a-f]{4}-/i;
export function cleanIdentifier(v?: string | null): string | null {
  const s = (v || "").trim();
  if (!s || FAKE_ID.test(s) || /^\d+$/.test(s)) return null;
  return s;
}

export function dedupeHash(sourceType: string, sourceRefId: string, task: string): string {
  const norm = `${sourceType.toLowerCase().trim()}|${sourceRefId.trim()}|${task.toLowerCase().trim()}`;
  return createHash("sha256").update(norm).digest("hex");
}

export function normalizeUrgencyToPriority(u?: string | null): string {
  const map: Record<string, string> = {
    low: "low", medium: "medium", normal: "medium", high: "high",
    urgent: "urgent", critical: "urgent", p0: "urgent", p1: "high", p2: "medium", p3: "low",
  };
  return map[(u || "").trim().toLowerCase()] ?? "medium";
}

// ─── persistence with merge ──────────────────────────────────────────────────

export interface SaveContext {
  userId: string;
  sourceType: string; // Email | Chat | Meeting
  sourceRefId: string;
  sourceDetail?: string | null;
  sourceLink?: string | null;
  dateGiven?: string | null;
}

/**
 * Persist extracted tasks with two-line dedup:
 *  1. hard: skip if a row with the same dedupe_hash exists (reprocessing guard)
 *  2. soft merge: if an OPEN row with the same (normalized_heading, spoc)
 *     exists, append an update line to all_updates instead of inserting.
 * Returns {inserted, merged, skipped}.
 */
export async function saveExtractedTasks(
  ctx: SaveContext,
  tasks: ExtractedTask[],
): Promise<{ inserted: number; merged: number; skipped: number }> {
  const sb = getAdminSupabase();
  if (!sb) return { inserted: 0, merged: 0, skipped: tasks.length };

  let inserted = 0, merged = 0, skipped = 0;

  for (const t of tasks) {
    const heading = (t.taskHeading || "").trim();
    if (!heading) { skipped++; continue; }

    const spoc = cleanIdentifier(t.owner);
    const normalized = normalizeHeading(heading);
    const hash = dedupeHash(ctx.sourceType, ctx.sourceRefId, heading);

    // (1) hard dedup
    const { data: dup } = await sb
      .from("tasks").select("id").eq("user_id", ctx.userId).eq("dedupe_hash", hash).maybeSingle();
    if (dup) { skipped++; continue; }

    // (2) soft merge on (normalized_heading, spoc) among open tasks
    const { data: openMatch } = await sb
      .from("tasks").select("id, all_updates")
      .eq("user_id", ctx.userId).eq("status", "todo")
      .eq("normalized_heading", normalized)
      .eq("spoc", spoc ?? "")
      .limit(1).maybeSingle();

    const updateLine = formatUpdateLine(ctx, spoc, t);
    if (openMatch) {
      const existing = ((openMatch as { all_updates?: string }).all_updates || "").trim();
      const next = existing ? `${existing}\n${updateLine}` : updateLine;
      await sb.from("tasks").update({ all_updates: next, updated_at: new Date().toISOString() })
        .eq("id", (openMatch as { id: string }).id);
      merged++;
      continue;
    }

    await sb.from("tasks").insert({
      id: randomUUID(),
      user_id: ctx.userId,
      title: heading.slice(0, 500),
      description: t.taskDescription ?? null,
      status: "todo",
      priority: normalizeUrgencyToPriority(t.urgency),
      due_date: t.deadline ?? null,
      source_type: ctx.sourceType,
      source_ref_id: ctx.sourceRefId,
      source_detail: ctx.sourceDetail ?? null,
      source_link: ctx.sourceLink ?? null,
      rationale: t.rationale ?? null,
      growth_pillar: t.growthPillar ?? null,
      spoc: spoc,
      spoc_contact: cleanIdentifier(t.ownerContact),
      date_given: ctx.dateGiven ?? null,
      normalized_heading: normalized,
      dedupe_hash: hash,
    });
    inserted++;
  }

  return { inserted, merged, skipped };
}

function formatUpdateLine(ctx: SaveContext, spoc: string | null, t: ExtractedTask): string {
  const when = (ctx.dateGiven || new Date().toISOString()).slice(0, 16).replace("T", " ");
  const channel = ctx.sourceType;
  const tag = [when, spoc, channel].filter(Boolean).join(" · ");
  const body = (t.taskDescription || t.rationale || "").replace(/\s+/g, " ").trim();
  return tag ? `[${tag}] ${body}` : body;
}
