import { getDb } from "@/lib/db";
import { decrypt } from "@/lib/crypto";
import { alreadyProcessed, markProcessed } from "@/lib/cron";
import { applySideEffects, linksFrom, sendWhatsAppText, type WhatsAppLink } from "@/lib/whatsapp";

// Answers one inbound WhatsApp message as the linked user: through the same
// /api/chat the app uses (with that user's scoped gateway token), applying the
// data changes the browser would apply, and holding confirm-before-act actions
// until the user replies YES.

const HISTORY_TURNS = 20;
const YES = /^\s*(yes|y|confirm|ok|okay|go ahead|send it|do it)\s*[.!]*\s*$/i;
const NO = /^\s*(no|n|cancel|stop|don'?t)\s*[.!]*\s*$/i;
const LINK = /^\s*link\s+(\d{6})\s*$/i;

interface InboundMessage { id: string; from: string; type: string; text?: { body?: string } }
type Effect = { type: string; data?: Record<string, unknown> };

const origin = () => (process.env.NEXTAUTH_URL ?? "").replace(/\/$/, "");

/** Runs one chat turn over the SSE stream and returns what the app would have shown. */
async function chatTurn(token: string, message: string, link: WhatsAppLink) {
  const db = getDb()!;
  const [tasks, notes, goals] = await Promise.all(["tasks", "notes", "goals"].map(async (t) =>
    ((await db.from(t).select("*").eq("user_id", link.user_id)).data ?? []) as unknown[]));
  const res = await fetch(`${origin()}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ message, history: link.history, tasks, notes, goals, timezone: process.env.WHATSAPP_TIMEZONE || "Asia/Kolkata" }),
  });
  if (!res.ok || !res.body) return { text: "I couldn't reach my brain just now - try again in a minute.", confirm: null, effects: [] as Effect[] };

  let text = "";
  let confirm: { tool: string; args: unknown; summary: string } | null = null;
  let effects: Effect[] = [];
  for (const block of (await res.text()).split("\n\n")) {
    const event = block.match(/^event: (\w+)/m)?.[1];
    const raw = block.match(/^data: (.*)$/m)?.[1];
    if (!event || !raw) continue;
    const data = JSON.parse(raw);
    if (event === "text") text += data.text ?? "";
    else if (event === "confirm" && !confirm && !data.clientAction) confirm = { tool: data.tool, args: data.args, summary: data.summary };
    else if (event === "done") effects = data.sideEffects ?? [];
    else if (event === "error") text += `\n\n${data.message ?? "Something went wrong."}`;
  }
  return { text: text.trim(), confirm, effects };
}

async function act(token: string, pending: NonNullable<WhatsAppLink["pending"]>): Promise<string> {
  const res = await fetch(`${origin()}/api/act`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ tool: pending.tool, args: pending.args }),
  });
  const body = await res.json().catch(() => ({}));
  return [body.result ?? (res.ok ? "Done." : "That didn't go through."), body.openUrl ? `Draft: ${body.openUrl}` : ""].filter(Boolean).join("\n");
}

export async function handleInbound(msg: InboundMessage): Promise<void> {
  const db = getDb();
  if (!db) return;
  // Meta retries deliveries it thinks failed; answer each message once.
  if (await alreadyProcessed(db, "_whatsapp", "whatsapp", msg.id)) return;
  await markProcessed(db, "_whatsapp", "whatsapp", msg.id);

  const body = msg.type === "text" ? msg.text?.body?.trim() ?? "" : "";
  const code = body.match(LINK)?.[1];
  if (code) {
    const { data } = await db.from("whatsapp_links").select("user_id, code_expires_at").eq("link_code", code).maybeSingle();
    const row = data as { user_id: string; code_expires_at: string | null } | null;
    if (!row || !row.code_expires_at || new Date(row.code_expires_at).getTime() < Date.now()) {
      await sendWhatsAppText(msg.from, "That code isn't valid or has expired. Get a new one in The Third Eye → Settings → WhatsApp.");
      return;
    }
    await db.from("whatsapp_links").update({ phone: null }).eq("phone", msg.from);
    await db.from("whatsapp_links").update({
      phone: msg.from, link_code: null, code_expires_at: null, linked_at: new Date().toISOString(), last_inbound_at: new Date().toISOString(),
    }).eq("user_id", row.user_id);
    await sendWhatsAppText(msg.from, "Linked ✅ This is JARVIS. Message me here like you do in the app - tasks, email, calendar, questions - and I'll send your reminders and briefings here too.");
    return;
  }

  const { data } = await db.from("whatsapp_links").select("*").eq("phone", msg.from).maybeSingle();
  const link = data as WhatsAppLink | null;
  const token = link?.gateway_token_enc ? decrypt(link.gateway_token_enc) : null;
  if (!link || !token) {
    await sendWhatsAppText(msg.from, "Hi! This number isn't linked to The Third Eye yet. Open the app → Settings → WhatsApp → Link, then send me the code.");
    return;
  }
  await db.from("whatsapp_links").update({ last_inbound_at: new Date().toISOString() }).eq("user_id", link.user_id);
  if (!body) {
    await sendWhatsAppText(msg.from, "I can read text messages here for now - type what you need.");
    return;
  }

  await sendWhatsAppText(msg.from, await answer(link, token, body));
}

/**
 * One reply from JARVIS as the link's user, over any chat transport (Meta's
 * webhook or a bridge like OpenClaw). Keeps the shared history and holds a
 * confirm-before-act action until a YES or NO.
 */
export async function answer(link: WhatsAppLink, token: string, body: string): Promise<string> {
  const db = getDb()!;
  if (link.pending && (YES.test(body) || NO.test(body))) {
    const reply = YES.test(body) ? await act(token, link.pending) : "Cancelled - nothing was done.";
    await db.from("whatsapp_links").update({ pending: null }).eq("user_id", link.user_id);
    return reply;
  }

  const turn = await chatTurn(token, body, link);
  await applySideEffects(link.user_id, turn.effects);
  const parts = [turn.text || "Done."];
  const links = linksFrom(turn.effects);
  if (links.length) parts.push(links.join("\n"));
  if (turn.confirm) parts.push(`*Confirm before I act:* ${turn.confirm.summary}\nReply *YES* to go ahead or *NO* to cancel.`);
  const reply = parts.join("\n\n");
  await db.from("whatsapp_links").update({
    pending: turn.confirm,
    history: [...link.history, { role: "user", content: body }, { role: "assistant", content: reply }].slice(-HISTORY_TURNS),
  }).eq("user_id", link.user_id);
  return reply;
}
