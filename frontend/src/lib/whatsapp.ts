import { createHmac, randomInt, timingSafeEqual } from "crypto";
import { getDb } from "@/lib/db";

// JARVIS on WhatsApp, through Meta's WhatsApp Cloud API. A user links their
// number by sending a one-time code to JARVIS's number; after that their
// messages are answered by the same assistant as the app, and reminders and
// briefings can reach them there too.

const GRAPH = "https://graph.facebook.com/v21.0";
const MAX_TEXT = 4000;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface WhatsAppLink {
  user_id: string;
  phone: string | null;
  link_code: string | null;
  code_expires_at: string | null;
  gateway_token_enc: string | null;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  pending: { tool: string; args: unknown; summary: string } | null;
  notify: boolean;
  last_inbound_at: string | null;
  linked_at: string | null;
}

export function whatsappConfigured(): boolean {
  return !!(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_VERIFY_TOKEN && process.env.WHATSAPP_APP_SECRET);
}

/** Meta signs every webhook POST with the app secret; anything else is refused. */
export function validSignature(rawBody: string, header: string | null): boolean {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret || !header?.startsWith("sha256=")) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(rawBody).digest("hex"));
  const given = Buffer.from(header.slice(7));
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export const newLinkCode = () => String(randomInt(100000, 1000000));

/** WhatsApp has no markdown headings or links-with-text; keep the words, drop the syntax. */
export function toWhatsAppText(md: string): string {
  return md
    .replace(/\*\*(.+?)\*\*/g, "*$1*")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, "$1 ($2)")
    .trim();
}

function chunks(text: string): string[] {
  const out: string[] = [];
  let rest = text;
  while (rest.length > MAX_TEXT) {
    const cut = rest.lastIndexOf("\n", MAX_TEXT) > MAX_TEXT / 2 ? rest.lastIndexOf("\n", MAX_TEXT) : MAX_TEXT;
    out.push(rest.slice(0, cut));
    rest = rest.slice(cut).trimStart();
  }
  if (rest) out.push(rest);
  return out;
}

async function graphSend(payload: Record<string, unknown>): Promise<boolean> {
  const res = await fetch(`${GRAPH}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", ...payload }),
  }).catch(() => null);
  if (!res?.ok) console.error("whatsapp send failed", res?.status, (await res?.text().catch(() => ""))?.slice(0, 300));
  return !!res?.ok;
}

export async function sendWhatsAppText(to: string, text: string): Promise<boolean> {
  let ok = true;
  for (const body of chunks(toWhatsAppText(text))) ok = (await graphSend({ to, type: "text", text: { body, preview_url: true } })) && ok;
  return ok;
}

/**
 * Proactive updates (reminders, briefings). Inside WhatsApp's 24-hour window
 * after the user last wrote, plain text is allowed; outside it Meta only
 * delivers pre-approved templates, so the update goes as the WHATSAPP_UPDATE_TEMPLATE
 * template with the text as its one body parameter.
 */
export async function notifyWhatsApp(userId: string, text: string): Promise<boolean> {
  if (!whatsappConfigured()) return false;
  const db = getDb();
  if (!db) return false;
  const { data } = await db.from("whatsapp_links").select("phone, notify, last_inbound_at").eq("user_id", userId).maybeSingle();
  const link = data as Pick<WhatsAppLink, "phone" | "notify" | "last_inbound_at"> | null;
  if (!link?.phone || !link.notify) return false;
  const open = link.last_inbound_at && Date.now() - new Date(link.last_inbound_at).getTime() < DAY_MS;
  if (open) return sendWhatsAppText(link.phone, text);
  return graphSend({
    to: link.phone,
    type: "template",
    template: {
      name: process.env.WHATSAPP_UPDATE_TEMPLATE || "jarvis_update",
      language: { code: process.env.WHATSAPP_TEMPLATE_LANG || "en" },
      components: [{ type: "body", parameters: [{ type: "text", text: toWhatsAppText(text).replace(/\s*\n+\s*/g, " · ").slice(0, 1000) }] }],
    },
  });
}

/**
 * The browser applies JARVIS's data changes (tasks, notes, goals, expenses)
 * itself after a reply. On WhatsApp there is no browser, so the same side
 * effects are written here, as the same rows the app's hooks would write.
 */
export async function applySideEffects(userId: string, effects: Array<{ type: string; data?: Record<string, unknown> }>): Promise<void> {
  const db = getDb();
  if (!db) return;
  const now = new Date().toISOString();
  for (const { type, data: d = {} } of effects) {
    const id = typeof d.id === "string" ? d.id : null;
    if (type === "task_create" && d.title) {
      await db.from("tasks").insert({
        id: crypto.randomUUID(), user_id: userId, title: d.title, priority: d.priority ?? "medium", status: "todo",
        assignee: d.assignee ?? null, agent: d.agent ?? null, due_date: d.due_date ?? null, description: d.description ?? null, created_at: now,
      });
    } else if (type === "task_update" && id) {
      await db.from("tasks").update((d.patch as Record<string, unknown>) ?? {}).eq("id", id).eq("user_id", userId);
    } else if (type === "task_delete" && id) {
      await db.from("tasks").delete().eq("id", id).eq("user_id", userId);
    } else if (type === "note_create" && d.title) {
      await db.from("notes").insert({ id: crypto.randomUUID(), user_id: userId, title: d.title, content: d.content ?? "", pinned: false, created_at: now, updated_at: now });
    } else if (type === "note_delete" && id) {
      await db.from("notes").delete().eq("id", id).eq("user_id", userId);
    } else if (type === "goal_create" && d.title) {
      await db.from("goals").insert({
        id: crypto.randomUUID(), user_id: userId, title: d.title, category: d.category ?? "Personal", target: d.target ?? 100,
        current: d.current ?? 0, unit: d.unit ?? "%", deadline: d.deadline ?? null, description: d.description ?? null, created_at: now,
      });
    } else if (type === "goal_delete" && id) {
      await db.from("goals").delete().eq("id", id).eq("user_id", userId);
    } else if (type === "expense_create" && typeof d.amount === "number" && d.amount > 0) {
      await db.from("expenses").insert({
        id: crypto.randomUUID(), user_id: userId, amount: d.amount, category: d.category ?? "Other", note: d.note ?? null,
        gst_rate: typeof d.gst_rate === "number" && d.gst_rate > 0 ? d.gst_rate : null,
        spent_on: typeof d.spent_on === "string" ? d.spent_on : now.slice(0, 10), created_at: now,
      });
    }
  }
}

/** Links shown in a reply (Gmail drafts, apps JARVIS opened) become plain URLs on WhatsApp. */
export function linksFrom(effects: Array<{ type: string; data?: Record<string, unknown> }>): string[] {
  return effects.filter((e) => e.type === "open_url" && typeof e.data?.url === "string" && /^https?:/.test(e.data.url as string))
    .map((e) => `${e.data!.label ?? "Link"}: ${e.data!.url}`);
}
