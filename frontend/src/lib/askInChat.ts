import type { Db } from "@/lib/db";
import { sendPush } from "@/lib/push";
import { ASK_CHAT_ID } from "@/lib/askChatId";

export { ASK_CHAT_ID };

// Anything the assistant needs from the person - a decision, a detail, a step
// only they can take - is asked as a message from the assistant in chat, in
// one running conversation, so answering it there carries the work on.

const TITLE = "JARVIS needs you";
const KEEP = 200;

export async function askInChat(sb: Db, email: string, question: string): Promise<void> {
  const text = question.trim().slice(0, 6000);
  if (!text) return;
  const { error } = await sb.rpc("append_conversation_message", {
    p_user: email, p_id: ASK_CHAT_ID, p_title: TITLE,
    p_message: { id: crypto.randomUUID(), role: "assistant", content: text },
    p_history: { role: "assistant", content: text }, p_keep: KEEP,
  });
  if (error) throw new Error(error.message);
  await sendPush(email, TITLE, text.split("\n")[0].slice(0, 160), `/assistant?chat=${ASK_CHAT_ID}`).catch(() => false);
}
