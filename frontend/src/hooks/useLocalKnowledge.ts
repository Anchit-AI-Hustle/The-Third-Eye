"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import { dataList, dataInsert, dataDelete } from "@/lib/dataClient";

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

const KEY = "jarvis_knowledge_v1";
const CHUNK_SIZE = 500;

function ls(): KnowledgeDoc[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(KEY) ?? "[]"); } catch { return []; }
}
function lsSet(v: KnowledgeDoc[]) { localStorage.setItem(KEY, JSON.stringify(v)); }

function chunkText(text: string): string[] {
  const words = text.split(/\s+/);
  const chunks: string[] = [];
  for (let i = 0; i < words.length; i += CHUNK_SIZE) {
    chunks.push(words.slice(i, i + CHUNK_SIZE).join(" "));
  }
  return chunks.length > 0 ? chunks : [text];
}

const TEXT_TYPES = new Set([".txt", ".md", ".markdown", ".csv", ".json", ".js", ".ts", ".py", ".html", ".xml", ".yaml", ".yml"]);

function getExt(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i).toLowerCase() : "";
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string ?? "");
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsText(file);
  });
}

export interface SearchResult {
  doc_id: string;
  doc_title: string;
  chunk_index: number;
  content: string;
  score: number;
}

export function searchDocs(docs: KnowledgeDoc[], query: string, topK = 5): SearchResult[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0 || docs.length === 0) return [];

  const results: SearchResult[] = [];
  for (const doc of docs) {
    if (doc.processing_status !== "ready") continue;
    const chunks = chunkText(doc.content);
    chunks.forEach((chunk, idx) => {
      const lower = chunk.toLowerCase();
      let score = 0;
      for (const term of terms) score += lower.split(term).length - 1;
      if (score > 0) results.push({ doc_id: doc.id, doc_title: doc.title, chunk_index: idx, content: chunk, score });
    });
  }
  return results.sort((a, b) => b.score - a.score).slice(0, topK);
}

export function useLocalKnowledge() {
  const { data: session } = useSession();
  const userId = session?.user?.email ?? null;
  const [docs, setDocs] = useState<KnowledgeDoc[]>([]);
  const [ready, setReady] = useState(false);
  const [uploading, setUploading] = useState(false);
  const remote = useRef(false);

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    dataList<KnowledgeDoc>("knowledge_docs").then((r) => {
      if (cancelled) return;
      remote.current = r.remote;
      setDocs(r.remote ? r.rows : ls());
      setReady(true);
    });
    return () => { cancelled = true; };
  }, [userId]);

  const upload = useCallback(async (files: FileList | File[]) => {
    setUploading(true);
    const arr = Array.from(files);
    const newDocs: KnowledgeDoc[] = [];

    for (const file of arr) {
      const ext = getExt(file.name);
      const id = crypto.randomUUID();
      const title = file.name;

      if (!TEXT_TYPES.has(ext) && ext !== "") {
        newDocs.push({
          id, title, content: "", file_type: ext.replace(".", ""),
          file_size_bytes: file.size, created_at: new Date().toISOString(),
          chunk_count: 0, processing_status: "failed",
          error: `Cannot read ${ext.toUpperCase()} files in browser mode. Please convert to TXT or MD.`,
        });
        continue;
      }

      try {
        const content = await readFileAsText(file);
        const chunks = chunkText(content);
        newDocs.push({
          id, title, content, file_type: ext.replace(".", "") || "txt",
          file_size_bytes: file.size, created_at: new Date().toISOString(),
          chunk_count: chunks.length, processing_status: "ready",
        });
      } catch {
        newDocs.push({
          id, title, content: "", file_type: ext.replace(".", ""),
          file_size_bytes: file.size, created_at: new Date().toISOString(),
          chunk_count: 0, processing_status: "failed", error: "Failed to read file.",
        });
      }
    }

    setDocs((prev) => {
      const next = [...newDocs, ...prev];
      if (!remote.current) lsSet(next);
      return next;
    });
    if (remote.current) await dataInsert("knowledge_docs", newDocs);

    // Cortex: embed ready docs for semantic search (best-effort, no-op if unconfigured).
    for (const d of newDocs) {
      if (d.processing_status !== "ready" || !d.content) continue;
      fetch("/api/cortex/ingest", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ docId: d.id, title: d.title, content: d.content }),
      }).catch(() => {});
    }
    setUploading(false);
  }, []);

  const remove = useCallback(async (id: string) => {
    setDocs((prev) => {
      const next = prev.filter((d) => d.id !== id);
      if (!remote.current) lsSet(next);
      return next;
    });
    if (remote.current) await dataDelete("knowledge_docs", id);
    fetch(`/api/cortex/ingest?docId=${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => {});
  }, []);

  return { docs, ready, uploading, upload, remove };
}
