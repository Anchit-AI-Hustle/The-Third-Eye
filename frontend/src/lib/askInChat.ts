import type { Db } from "@/lib/db";
import { sendPush } from "@/lib/push";

// Anything the assistant needs from the person - a decision, a detail, a step
// only they can take - is asked as a message from the assistant in chat, in
// one running conversation, so answering it there carries the work on.

export const ASK_CHAT_ID = "jarvis-needs-you";
const TITLE = "JARVIS needs you";
const KEEP = 200;

export async function askInChat(sb: Db, email: string, question: string): Promise<void> {
  const text = question.trim().slice(0, 6000);
  if (!text) return;
  const now = new Date().toISOString();
  const { data } = await sb.from("conversations").select("messages, history").eq("user_id", email).eq("id", ASK_CHAT_ID).maybeSingle();
  const row = data as { messages?: unknown[]; history?: unknown[] } | null;
  const messages = [...(row?.messages ?? []), { id: crypto.randomUUID(), role: "assistant", content: text }].slice(-KEEP);
  const history = [...(row?.history ?? []), { role: "assistant", content: text }].slice(-KEEP);
  await sb.from("conversations").upsert(
    { user_id: email, id: ASK_CHAT_ID, title: TITLE, project_id: null, messages, history, updated_at: now },
    { onConflict: "user_id,id" },
  );
  await sendPush(email, TITLE, text.split("\n")[0].slice(0, 160), `/assistant?chat=${ASK_CHAT_ID}`).catch(() => false);
}
