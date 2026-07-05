// Cortex — native memory & knowledge engine. Ports the backend's memory/ +
// knowledge/ RAG into the app: semantic recall over past interactions and
// document chunks via Supabase pgvector + Gemini embeddings. Every function is
// degrade-safe: with no service-role key or no embeddings, callers fall back to
// the app's existing behavior.

import { getAdminSupabase } from "@/lib/serverSupabase";
import { embed, embedBatch, cortexEnabled } from "@/lib/cortex/embed";

export { cortexEnabled };

export interface MemoryHit { content: string; kind: string; similarity: number }
export interface ChunkHit { doc_id: string; doc_title: string; chunk_index: number; content: string; similarity: number }

export async function retrieveMemories(email: string, query: string, k = 5): Promise<MemoryHit[]> {
  const sb = getAdminSupabase();
  if (!sb || !email) return [];
  const vec = await embed(query);
  if (!vec) return [];
  const { data } = await sb.rpc("match_cortex_memories", { p_user_id: email, query_embedding: vec, match_count: k });
  return (data ?? []).filter((m: any) => m.similarity > 0.5);
}

export async function rememberExchange(email: string, userMsg: string, assistantMsg: string): Promise<void> {
  const sb = getAdminSupabase();
  if (!sb || !email) return;
  const content = `User: ${userMsg}\nJARVIS: ${assistantMsg}`.slice(0, 4000);
  const vec = await embed(content);
  if (!vec) return;
  await sb.from("cortex_memories").insert({ user_id: email, kind: "episodic", content, embedding: vec });
}

export async function searchChunks(email: string, query: string, k = 5): Promise<ChunkHit[]> {
  const sb = getAdminSupabase();
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
  const sb = getAdminSupabase();
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
  const sb = getAdminSupabase();
  if (!sb || !email) return;
  await sb.from("cortex_doc_chunks").delete().eq("user_id", email).eq("doc_id", docId);
}
