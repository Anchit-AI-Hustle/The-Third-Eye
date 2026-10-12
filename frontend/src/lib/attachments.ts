// Files attached to an Assistant message. They travel inline as base64 in the
// chat request, so the whole set must fit Vercel's 4.5 MB request body.

export interface Attachment {
  name: string;
  mimeType: string;
  data: string;
}

export const MAX_ATTACHMENTS = 5;
export const MAX_ATTACHMENT_BYTES = 3 * 1024 * 1024;
export const ATTACHMENT_ACCEPT = "image/*,application/pdf,text/*,.md,.csv,.json";

const READABLE = /^(image\/(png|jpeg|webp|heic|heif|gif)|application\/pdf|text\/[\w.+-]+|application\/json)$/;
const isText = (m: string) => m.startsWith("text/") || m === "application/json";

export function cleanAttachments(raw: unknown): Attachment[] {
  if (!Array.isArray(raw)) return [];
  let budget = Math.ceil((MAX_ATTACHMENT_BYTES * 4) / 3);
  const out: Attachment[] = [];
  for (const a of raw.slice(0, MAX_ATTACHMENTS)) {
    const name = String(a?.name ?? "file").slice(0, 120);
    const mimeType = String(a?.mimeType ?? "").toLowerCase();
    const data = typeof a?.data === "string" ? a.data : "";
    if (!READABLE.test(mimeType) || !data || data.length > budget) continue;
    budget -= data.length;
    out.push({ name, mimeType, data });
  }
  return out;
}

export function geminiParts(atts: Attachment[]) {
  return atts.map((a) => ({ inlineData: { mimeType: a.mimeType, data: a.data } }));
}

/** The readable text of text attachments, for tools that work on the user's file. */
export function attachedText(atts: Attachment[]): string {
  return atts.filter((a) => isText(a.mimeType))
    .map((a) => `# ${a.name}\n${Buffer.from(a.data, "base64").toString("utf8")}`).join("\n\n");
}

// Text-only fallback models can still read text files; for the rest they are told
// what was attached so they don't answer as if nothing was.
export function attachmentsAsText(atts: Attachment[]): string {
  return atts.map((a) => isText(a.mimeType)
    ? `\n\n[Attached file "${a.name}"]\n${Buffer.from(a.data, "base64").toString("utf8").slice(0, 20_000)}`
    : `\n\n[Attached ${a.mimeType} "${a.name}" — this model can't open it; say so if the answer depends on it]`).join("");
}
