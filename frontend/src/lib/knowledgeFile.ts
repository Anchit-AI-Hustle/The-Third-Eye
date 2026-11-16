// One uploaded file as a Knowledge document: text, PDF and Word files are read
// for their words; a photo is recorded by name and size. Shared by the website
// (useLocalKnowledge) and the native apps' upload (api/knowledge/upload).

export interface KnowledgeDoc {
  id: string;
  title: string;
  content: string;
  file_type: string;
  file_size_bytes: number;
  created_at: string;
  chunk_count: number;
  processing_status: "ready" | "failed";
  error?: string;
}

const CHUNK_SIZE = 500;

export function chunkText(text: string): string[] {
  const words = text.split(/\s+/);
  const chunks: string[] = [];
  for (let i = 0; i < words.length; i += CHUNK_SIZE) {
    chunks.push(words.slice(i, i + CHUNK_SIZE).join(" "));
  }
  return chunks.length > 0 ? chunks : [text];
}

export const TEXT_TYPES = new Set([".txt", ".md", ".markdown", ".csv", ".json", ".js", ".ts", ".py", ".html", ".xml", ".yaml", ".yml", ".sh", ".env", ".sql", ".rtf", ".log"]);
export const IMAGE_TYPES = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg", ".bmp", ".heic", ".heif"]);
export const DOC_TYPES = new Set([".pdf", ".doc", ".docx"]);

export function getExt(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i).toLowerCase() : "";
}

function base64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export async function knowledgeDocFrom(name: string, bytes: Uint8Array, mime = ""): Promise<KnowledgeDoc> {
  const ext = getExt(name);
  const base = {
    id: crypto.randomUUID(), title: name, file_type: ext.replace(".", ""),
    file_size_bytes: bytes.length, created_at: new Date().toISOString(),
  };
  const failed = (error: string): KnowledgeDoc => ({ ...base, content: "", chunk_count: 0, processing_status: "failed", error });

  if (IMAGE_TYPES.has(ext)) {
    const sizeKb = Math.round(bytes.length / 1024);
    const dataUrl = `data:${mime || "image"};base64,${base64(bytes.subarray(0, 120))}`;
    const content = `[Photo/Image: ${name} (${sizeKb} KB, ${mime || "image"})]\nEmbedded image data: ${dataUrl.slice(0, 150)}...`;
    return { ...base, file_type: base.file_type || "image", content, chunk_count: 1, processing_status: "ready" };
  }

  if (DOC_TYPES.has(ext)) {
    // Real text out of the PDF or Word file; one that can't be read is marked
    // failed with the reason, never stored as "ready" binary junk.
    try {
      const { extractDocText } = await import("@/lib/docText");
      const content = await extractDocText(name, bytes);
      return { ...base, content, chunk_count: chunkText(content).length, processing_status: "ready" };
    } catch (err) {
      return failed(err instanceof Error ? err.message : "Couldn't read this document.");
    }
  }

  if (!TEXT_TYPES.has(ext) && ext !== "") {
    return failed(`Cannot read ${ext.toUpperCase()} files. Please convert to TXT, MD, PDF or DOCX.`);
  }

  try {
    const content = new TextDecoder().decode(bytes);
    return { ...base, file_type: base.file_type || "txt", content, chunk_count: chunkText(content).length, processing_status: "ready" };
  } catch {
    return failed("Failed to read file.");
  }
}
