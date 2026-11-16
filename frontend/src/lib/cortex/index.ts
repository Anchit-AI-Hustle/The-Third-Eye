// Cortex — native memory & knowledge engine. Ports the backend's memory/ +
// knowledge/ RAG into the app: semantic recall over past interactions and
// document chunks via Postgres pgvector + Gemini embeddings. Every function is
// degrade-safe: with no service-role key or no embeddings, callers fall back to
// the app's existing behavior.

import { getDb } from "@/lib/db";
import { embed, embedBatch, cortexEnabled } from "@/lib/cortex/embed";

export { cortexEnabled };

export interface MemoryHit { content: string; kind: string; similarity: number }
export interface ChunkHit { doc_id: string; doc_title: string; chunk_index: number; content: string; similarity: number }

export async function retrieveMemories(email: string, query: string, k = 5): Promise<MemoryHit[]> {
  const sb = getDb();
  if (!sb || !email) return [];
  const vec = await embed(query);
  if (!vec) return [];
  const { data } = await sb.rpc("match_cortex_memories", { p_user_id: email, query_embedding: vec, match_count: k });
  return (data ?? []).filter((m: any) => m.similarity > 0.5);
}

export async function rememberExchange(email: string, userMsg: string, assistantMsg: string): Promise<void> {
  const sb = getDb();
  if (!sb || !email) return;
  const content = `User: ${userMsg}\nJARVIS: ${assistantMsg}`.slice(0, 4000);
  const vec = await embed(content);
  if (!vec) return;
  await sb.from("cortex_memories").insert({ user_id: email, kind: "episodic", content, embedding: vec });
}

const IMPORT_MAX = 50;

/**
 * Stores background from the user's own history (e.g. a Claude export). The id
 * is a hash of the user and the text, so importing the same file again adds
 * nothing twice.
 */
export async function rememberBackground(email: string, texts: string[]): Promise<number> {
  const sb = getDb();
  if (!sb || !email || !cortexEnabled()) return 0;
  const clean = [...new Set(texts.map((t) => t.trim().slice(0, 2000)).filter(Boolean))].slice(0, IMPORT_MAX);
  const vectors = await embedBatch(clean);
  const rows = await Promise.all(clean.map(async (content, i) => ({
    id: `bg_${await sha256(`${email}\n${content}`)}`, user_id: email, kind: "background", content, embedding: vectors[i],
  })));
  const ready = rows.filter((r) => r.embedding);
  if (!ready.length) return 0;
  const { error } = await sb.from("cortex_memories").upsert(ready, { onConflict: "id", ignoreDuplicates: true });
  return error ? 0 : ready.length;
}

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function searchChunks(email: string, query: string, k = 5): Promise<ChunkHit[]> {
  const sb = getDb();
  if (!sb || !email) return [];
  const vec = await embed(query);
  if (!vec) return [];
  const { data } = await sb.rpc("match_cortex_chunks", { p_user_id: email, query_embedding: vec, match_count: k });
  return (data ?? []).filter((c: any) => c.similarity > 0.4);
}

const CHUNK_WORDS = 220;
const OVERLAP = 40;

function chunk(text: string): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= CHUNK_WORDS) return [text.trim()].filter(Boolean);
  const chunks: string[] = [];
  for (let i = 0; i < words.length; i += CHUNK_WORDS - OVERLAP) {
    chunks.push(words.slice(i, i + CHUNK_WORDS).join(" "));
    if (i + CHUNK_WORDS >= words.length) break;
  }
  return chunks;
}

export async function ingestDocument(
  email: string, docId: string, title: string, content: string,
): Promise<{ chunks: number }> {
  const sb = getDb();
  if (!sb || !email || !cortexEnabled()) return { chunks: 0 };
  await sb.from("cortex_doc_chunks").delete().eq("user_id", email).eq("doc_id", docId);
  const pieces = chunk(content);
  const vectors = await embedBatch(pieces);
  const rows = pieces
    .map((c, i) => ({ user_id: email, doc_id: docId, doc_title: title, chunk_index: i, content: c, embedding: vectors[i] }))
    .filter((r) => r.embedding);
  if (rows.length) await sb.from("cortex_doc_chunks").insert(rows);
  return { chunks: rows.length };
}

export async function deleteDocument(email: string, docId: string): Promise<void> {
  const sb = getDb();
  if (!sb || !email) return;
  await sb.from("cortex_doc_chunks").delete().eq("user_id", email).eq("doc_id", docId);
}
