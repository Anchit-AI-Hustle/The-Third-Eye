// Reads a Claude data export (Settings → Privacy → Export data) into short
// background pieces for the assistant's memory: each chat as a dialogue, each
// project's instructions and documents. Nothing else in the export is used.

const PIECE_CHARS = 1800;
const MESSAGE_CHARS = 1500;

type Block = { type?: string; text?: string };
type Message = { sender?: string; text?: string; content?: Block[] };
type Conversation = { name?: string; chat_messages?: Message[] };
type ProjectDoc = { filename?: string; content?: string };
type Project = { name?: string; description?: string; prompt_template?: string; docs?: ProjectDoc[] };

function messageText(m: Message): string {
  const fromBlocks = (m.content ?? []).filter((b) => b.type === "text" && b.text).map((b) => b.text).join("\n");
  return (fromBlocks || m.text || "").replace(/\s+/g, " ").trim();
}

/** Splits text into pieces of at most PIECE_CHARS, at line breaks where it can, each led by its topic. */
export function pieces(topic: string, lines: string[]): string[] {
  const head = topic ? `Topic: ${topic}\n` : "";
  const out: string[] = [];
  let cur = "";
  for (const line of lines) {
    const l = line.slice(0, PIECE_CHARS - head.length);
    if (cur && head.length + cur.length + l.length + 1 > PIECE_CHARS) { out.push(head + cur); cur = ""; }
    cur = cur ? `${cur}\n${l}` : l;
  }
  if (cur) out.push(head + cur);
  return out;
}

export function conversationPieces(list: Conversation[]): string[] {
  return list.flatMap((c) => {
    const lines = (c.chat_messages ?? [])
      .map((m) => {
        const text = messageText(m).slice(0, MESSAGE_CHARS);
        return text ? `${m.sender === "human" ? "I said" : "Claude said"}: ${text}` : "";
      })
      .filter(Boolean);
    return lines.length ? pieces(c.name?.trim() || "a conversation", lines) : [];
  });
}

export function projectPieces(list: Project[]): string[] {
  return list.flatMap((p) => {
    const name = p.name?.trim() || "a project";
    const lines = [
      p.description ? `Project about: ${p.description}` : "",
      p.prompt_template ? `My standing instructions for it: ${p.prompt_template}` : "",
      ...(p.docs ?? []).flatMap((d) => (d.content ? [`From my document ${d.filename ?? ""}: ${d.content}`] : [])),
    ].filter(Boolean).flatMap((l) => l.match(new RegExp(`[\\s\\S]{1,${MESSAGE_CHARS}}`, "g")) ?? []);
    return lines.length ? pieces(`my project ${name}`, lines) : [];
  });
}

/** Every piece from the export's JSON files, keyed by file name. */
export function claudeExportPieces(files: Record<string, string>): string[] {
  const out: string[] = [];
  for (const [name, raw] of Object.entries(files)) {
    let data: unknown;
    try { data = JSON.parse(raw); } catch { continue; }
    if (!Array.isArray(data)) continue;
    const base = name.split("/").pop() ?? name;
    if (base === "conversations.json") out.push(...conversationPieces(data as Conversation[]));
    else if (base === "projects.json") out.push(...projectPieces(data as Project[]));
  }
  return out;
}
