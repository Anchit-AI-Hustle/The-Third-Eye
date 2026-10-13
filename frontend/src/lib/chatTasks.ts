import { randomUUID } from "crypto";
import { z } from "zod";
import { getDb, type Db } from "@/lib/db";
import { llmCascade } from "@/lib/llmCascade";
import { parseLlmJson, validItems } from "@/lib/llmJson";
import { dedupeHash, normalizeHeading, normalizeUrgencyToPriority, saveExtractedTasks, type ExtractedTask } from "@/lib/tasks";
import { logActivity } from "@/lib/activity";

// Assistant chat -> Task Tracker. Each chat that does real work becomes one
// task of its own (or is filed under the open task it is about), kept in step
// as the chat goes on; small talk and quick questions are skipped. Only the
// messages since the last sync are read, so each turn costs one model call.

const SOURCE = "Assistant";
const CONTEXT_MESSAGES = 4;
// Sized for Groq's free 8K tokens-per-minute budget, with room for the reply.
const MAX_MESSAGE_CHARS = 600;
const MAX_TRANSCRIPT_CHARS = 6000;
const MAX_OPEN_TASKS = 40;
const RANK: Record<string, number> = { todo: 0, in_progress: 1, done: 2 };

const SYSTEM_PROMPT = `
You keep the user's Task Tracker in step with their chats with JARVIS, their AI assistant.
You get the user's open tasks, the task already tracking this chat (if any), and the
new part of the chat. Return STRICT JSON:
{"chat_task": null | {...}, "task_updates": [...], "follow_ups": [...]}

- chat_task: the piece of work this chat is about, or null when the chat is small
  talk, a greeting, a joke, or a quick question answered in one reply (time,
  weather, a fact, a definition). Work worth tracking: something the user asked
  to be made, done, planned, fixed, researched, sent, booked or decided.
  {"task_id": id of THIS CHAT'S TASK or of the open task this chat is clearly
     about, verbatim from the lists, else null,
   "heading": specific imperative <= 70 chars,
   "description": what was asked and what came of it, <= 180 chars,
   "status": "done" when JARVIS finished it in the chat and nothing is left |
     "in_progress" when it is partly done | "todo" when not started,
   "urgency": "Low" | "Medium" | "High" | "Critical",
   "deadline": ISO date the user gave, else null,
   "workspace": "office" for paid work | "personal" for everything else,
   "update": what happened in the new messages, <= 140 chars}
- task_updates: OTHER listed open tasks the new messages clearly progress or finish.
  Each: {"task_id": verbatim id, "update": <= 140 chars, "status": "in_progress" | "done" | null}
- follow_ups: things the USER still has to do that the chat surfaced and that are
  not the chat task itself. Each: {"task_heading": imperative <= 70 chars,
  "task_description": <= 180 chars, "workspace": "office" | "personal",
  "urgency": "Low" | "Medium" | "High" | "Critical", "deadline": ISO date or null}

HARD RULES: never invent ids, people or deadlines; when unsure, use null and
empty arrays. Never make a task out of JARVIS's own internal steps.
`.trim();

const nonEmpty = z.string().trim().min(1);
const nullable = z.string().nullish().catch(null);
const STATUSES = ["todo", "in_progress", "done"] as const;
const ChatTask = z.object({
  task_id: nullable,
  heading: nonEmpty,
  description: nullable,
  status: z.enum(STATUSES).catch("todo"),
  urgency: nullable,
  deadline: nullable,
  workspace: nullable,
  update: nullable,
});
const TaskUpdate = z.object({ task_id: nonEmpty, update: nonEmpty, status: z.enum(["in_progress", "done"]).nullish().catch(null) });
const FollowUp = z.object({
  task_heading: nonEmpty,
  task_description: nullable,
  workspace: nullable,
  urgency: nullable,
  deadline: nullable,
});

interface ChatMessage { role: string; content: string }
interface ConversationRow { title: string; messages: ChatMessage[]; tasks_synced_n: number | null; task_id: string | null }
interface TaskRow { id: string; title: string; status: string; workspace: string | null; all_updates?: string | null }

export interface ChatSyncResult { created: number; updated: number; skipped?: string; partial?: string }

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}...` : s);
const line = (m: ChatMessage) => `${m.role === "user" ? "USER" : "JARVIS"}: ${clip((m.content ?? "").replace(/\s+/g, " ").trim(), MAX_MESSAGE_CHARS)}`;
const taskLine = (t: TaskRow) => `- id=${t.id} [${t.workspace === "personal" ? "personal" : "office"} · ${t.status}] ${clip(t.title, 80)}`;

// Keeps the first new line (usually the request itself) and as many of the
// latest lines as fit.
function fitTranscript(earlier: string[], fresh: string[]): string {
  const [first, ...rest] = fresh;
  const pool = [...earlier, ...rest];
  let budget = MAX_TRANSCRIPT_CHARS - first.length;
  let start = pool.length;
  while (start > 0 && pool[start - 1].length + 1 <= budget) budget -= pool[--start].length + 1;
  const kept = pool.slice(start);
  const keptEarlier = Math.max(0, earlier.length - start);
  return [...kept.slice(0, keptEarlier), first, ...kept.slice(keptEarlier)].join("\n");
}

export async function syncChatTasks(email: string, chatId: string): Promise<ChatSyncResult> {
  const sb = getDb();
  if (!sb) return { created: 0, updated: 0, skipped: "not configured" };

  const { data: conv } = await sb
    .from("conversations").select("title, messages, tasks_synced_n, task_id")
    .eq("user_id", email).eq("id", chatId).maybeSingle();
  const chat = conv as ConversationRow | null;
  if (!chat) return { created: 0, updated: 0, skipped: "no chat" };

  const messages = (chat.messages ?? []).filter((m) => (m.content ?? "").trim());
  const synced = chat.tasks_synced_n ?? 0;
  // A chat shorter than what was read was rewound; read it again from the top.
  const from = synced > messages.length ? 0 : synced;
  const fresh = messages.slice(from);
  if (!fresh.some((m) => m.role === "user") || !fresh.some((m) => m.role === "assistant")) {
    await sb.from("conversations").update({ tasks_synced_at: new Date().toISOString() }).eq("user_id", email).eq("id", chatId);
    return { created: 0, updated: 0, skipped: "nothing new" };
  }

  const { data: openData } = await sb
    .from("tasks").select("id, title, status, workspace")
    .eq("user_id", email).in("status", ["todo", "in_progress"])
    .order("created_at", { ascending: false }).limit(MAX_OPEN_TASKS);
  const open = (openData as TaskRow[] | null) ?? [];
  // By key as well as by link: a sync that died between creating the task and
  // saving the link must not create a second one.
  const hash = dedupeHash(SOURCE, chatId, "chat");
  const ownQuery = sb.from("tasks").select("id, title, status, workspace").eq("user_id", email);
  const { data: ownData } = await (chat.task_id ? ownQuery.eq("id", chat.task_id) : ownQuery.eq("dedupe_hash", hash)).maybeSingle();
  const own = ownData as TaskRow | null;

  const transcript = fitTranscript(
    messages.slice(Math.max(0, from - CONTEXT_MESSAGES), from).map((m) => `(earlier) ${line(m)}`),
    fresh.map(line),
  );
  const prompt = [
    "OPEN TASKS:",
    open.filter((t) => t.id !== own?.id).map(taskLine).join("\n") || "(none)",
    "",
    "THIS CHAT'S TASK:",
    own ? taskLine(own) : "(none yet)",
    "",
    `CHAT "${chat.title}", NEW MESSAGES:`,
    transcript,
  ].join("\n");

  let parsed: Record<string, unknown>;
  const reasons: string[] = [];
  try {
    const out = await llmCascade({
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: prompt }],
      jsonMode: true,
      maxTokens: 1200,
      temperature: 0.1,
      stage: "chat-tasks",
      background: true,
    });
    const p = parseLlmJson(out.text);
    parsed = p.value;
    if (p.repaired) reasons.push("output repaired");
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    console.warn("chat task sync failed:", reason);
    return { created: 0, updated: 0, skipped: `extraction failed: ${reason}` };
  }

  const now = new Date().toISOString();
  const stamp = now.slice(0, 16).replace("T", " ");
  const known = new Map([...open, ...(own ? [own] : [])].map((t) => [t.id, t]));
  let created = 0, updated = 0;

  // Tasks only move forward, and one the user finished or cancelled is left alone.
  async function progress(id: string, text: string | null | undefined, status: string | null | undefined) {
    const current = known.get(id)?.status ?? "";
    if (!(current in RANK) || current === "done") return;
    const { data: row } = await sb!.from("tasks").select("all_updates").eq("user_id", email).eq("id", id).maybeSingle();
    const existing = ((row as { all_updates?: string } | null)?.all_updates || "").trim();
    const patch: Record<string, unknown> = { updated_at: now };
    if (text) patch.all_updates = `${existing ? `${existing}\n` : ""}[${stamp} · ${SOURCE}] ${text}`;
    if (status && RANK[status] > RANK[current]) {
      patch.status = status;
      if (status === "done") patch.completed_at = now.slice(0, 10);
    }
    await sb!.from("tasks").update(patch).eq("user_id", email).eq("id", id);
    updated++;
  }

  let taskId = own?.id ?? chat.task_id;
  if (parsed.chat_task) {
    const c = ChatTask.safeParse(parsed.chat_task);
    if (!c.success) reasons.push("chat task invalid");
    else {
      const t = c.data;
      const target = t.task_id && known.has(t.task_id) ? t.task_id : own?.id;
      if (target) {
        await progress(target, t.update ?? t.description, t.status);
        taskId = target;
      } else {
        const id = randomUUID();
        const { error } = await sb.from("tasks").insert({
          id,
          user_id: email,
          title: t.heading.slice(0, 500),
          description: t.description,
          status: t.status,
          completed_at: t.status === "done" ? now.slice(0, 10) : null,
          priority: normalizeUrgencyToPriority(t.urgency),
          due_date: t.deadline,
          source_type: SOURCE,
          source_ref_id: chatId,
          source_detail: `Assistant chat · ${clip(chat.title, 80)}`,
          source_link: `/assistant?chat=${encodeURIComponent(chatId)}`,
          normalized_heading: normalizeHeading(t.heading),
          dedupe_hash: hash,
          workspace: t.workspace === "office" ? "office" : "personal",
          date_given: now,
          all_updates: t.update ? `[${stamp} · ${SOURCE}] ${t.update}` : null,
        });
        if (error) reasons.push(`chat task not saved: ${error.message}`);
        else { taskId = id; created++; }
      }
    }
  }

  const updates = validItems(parsed.task_updates, TaskUpdate);
  for (const u of updates.items) {
    if (u.task_id === taskId || !known.has(u.task_id)) continue;
    await progress(u.task_id, u.update, str(u.status));
  }

  const follow = validItems(parsed.follow_ups, FollowUp);
  if (follow.items.length) {
    const r = await saveExtractedTasks(
      {
        userId: email,
        sourceType: SOURCE,
        sourceRefId: `${chatId}:${messages.length}`,
        sourceDetail: `Assistant chat · ${clip(chat.title, 80)}`,
        sourceLink: `/assistant?chat=${encodeURIComponent(chatId)}`,
        dateGiven: now,
      },
      follow.items.map((f): ExtractedTask => ({
        taskHeading: f.task_heading,
        taskDescription: str(f.task_description),
        urgency: str(f.urgency),
        deadline: str(f.deadline),
        workspace: f.workspace === "office" ? "office" : "personal",
      })),
    );
    created += r.inserted;
    updated += r.merged;
  }

  const dropped = updates.dropped + follow.dropped;
  if (dropped) reasons.push(`${dropped} invalid item(s) dropped`);
  const partial = reasons.join("; ") || undefined;
  if (partial) console.warn("chat task sync partial:", partial);

  await sb.from("conversations").update({ tasks_synced_n: messages.length, tasks_synced_at: now, task_id: taskId }).eq("user_id", email).eq("id", chatId);
  if (created || updated) {
    await logActivity(email, "chat_sync", `Chat synced to tasks: ${clip(chat.title, 60)}`, {
      detail: `${created} task(s) created, ${updated} updated`,
      context: { chatId, created, updated },
    });
  }
  return { created, updated, partial };
}

// Daily catch-up for chats the browser never synced (tab killed mid-chat).
// Bounded per run so it never eats the free tiers' daily quota.
const CATCH_UP_PER_RUN = 8;
const CATCH_UP_DAYS = 3;

export async function syncStaleChats(sb: Db): Promise<{ checked: number; synced: number }> {
  const since = new Date(Date.now() - CATCH_UP_DAYS * 86_400_000).toISOString();
  const { data } = await sb
    .from("conversations").select("user_id, id, updated_at, tasks_synced_at")
    .gt("updated_at", since).order("updated_at", { ascending: false }).limit(200);
  const stale = ((data as { user_id: string; id: string; updated_at: string; tasks_synced_at: string | null }[] | null) ?? [])
    .filter((c) => !c.tasks_synced_at || new Date(c.updated_at) > new Date(c.tasks_synced_at))
    .slice(0, CATCH_UP_PER_RUN);
  let synced = 0;
  for (const c of stale) {
    const r = await syncChatTasks(c.user_id, c.id);
    if (r.skipped?.startsWith("extraction failed")) break;
    if (!r.skipped) synced++;
  }
  return { checked: stale.length, synced };
}
