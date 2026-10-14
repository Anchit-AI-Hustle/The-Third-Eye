// Files attached to an Assistant message. They travel inline as base64 in the
// chat request, so the whole set must fit Vercel's 4.5 MB request body.

export interface Attachment {
  name: string;
  mimeType: string;
  data: string;
}

export const MAX_ATTACHMENTS = 5;
export const MAX_ATTACHMENT_BYTES = 3 * 1024 * 1024;
export const ATTACHMENT_ACCEPT = "image/*,application/pdf,text/*,.md,.csv,.json,.ts,.tsx,.js,.jsx,.py,.html,.css,.sql,.xml,.yaml,.yml,.sh,.env,.log,.toml,.txt";

export const CODE_OR_TEXT_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|py|html|css|scss|sql|xml|yaml|yml|sh|bash|env|log|toml|txt|md|csv|json)$/i;
const READABLE = /^(image\/(png|jpeg|webp|heic|heif|gif|svg\+xml)|application\/pdf|text\/[\w.+-]+|application\/(json|javascript|typescript|sql|xml|x-yaml|x-sh))$/;

export const isTextAttachment = (m: string, name?: string) =>
  m.startsWith("text/") ||
  m === "application/json" ||
  m === "application/javascript" ||
  m === "application/typescript" ||
  m === "application/sql" ||
  m === "application/xml" ||
  m === "application/x-yaml" ||
  (!!name && CODE_OR_TEXT_EXT.test(name));

export function cleanAttachments(raw: unknown): Attachment[] {
  if (!Array.isArray(raw)) return [];
  let budget = Math.ceil((MAX_ATTACHMENT_BYTES * 4) / 3);
  const out: Attachment[] = [];
  for (const a of raw.slice(0, MAX_ATTACHMENTS)) {
    const name = String(a?.name ?? "file").slice(0, 120);
    let mimeType = String(a?.mimeType ?? "").toLowerCase();
    const data = typeof a?.data === "string" ? a.data : "";
    if (CODE_OR_TEXT_EXT.test(name) && (!mimeType || mimeType === "application/octet-stream" || mimeType === "video/mp2t")) {
      mimeType = "text/plain";
    }
    if ((!READABLE.test(mimeType) && !CODE_OR_TEXT_EXT.test(name)) || !data || data.length > budget) continue;
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
  return atts.filter((a) => isTextAttachment(a.mimeType, a.name))
    .map((a) => `# ${a.name}\n${Buffer.from(a.data, "base64").toString("utf8")}`).join("\n\n");
}

// Text-only fallback models can still read text files; for the rest they are told
// what was attached so they don't answer as if nothing was.
export function attachmentsAsText(atts: Attachment[]): string {
  return atts.map((a) => isTextAttachment(a.mimeType, a.name)
    ? `\n\n[Attached file "${a.name}"]\n${Buffer.from(a.data, "base64").toString("utf8").slice(0, 20_000)}`
    : `\n\n[Attached ${a.mimeType} "${a.name}" — this model can't open it; say so if the answer depends on it]`).join("");
}
