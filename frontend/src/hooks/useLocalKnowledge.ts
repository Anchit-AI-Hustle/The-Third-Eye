"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import { dataList, dataInsert, dataDelete } from "@/lib/dataClient";
import { chunkText, DOC_TYPES, getExt, IMAGE_TYPES, knowledgeDocFrom, TEXT_TYPES, type KnowledgeDoc } from "@/lib/knowledgeFile";

export type { KnowledgeDoc };

// Per-account device cache; the database is the source of truth when there is one.
const KEY = "jarvis_knowledge_v1";
let activeUser: string | null = null;
const storageKey = () => (activeUser ? `${KEY}:${activeUser}` : KEY);
const useStorageUser = (u: string | null) => { activeUser = u; };

function ls(): KnowledgeDoc[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(storageKey()) ?? "[]"); } catch { return []; }
}
function lsSet(v: KnowledgeDoc[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(storageKey(), JSON.stringify(v));
    window.dispatchEvent(new CustomEvent("jarvis:knowledge", { detail: v }));
  } catch (err) {
    console.warn("Failed to persist knowledge docs in localStorage:", err);
  }
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
  useStorageUser(userId);
  const [docs, setDocs] = useState<KnowledgeDoc[]>([]);
  const [ready, setReady] = useState(false);
  const [uploading, setUploading] = useState(false);
  const remote = useRef(false);

  useEffect(() => {
    let cancelled = false;
    setReady(false);

    const onUpdate = (e: Event) => {
      setDocs((e as CustomEvent<KnowledgeDoc[]>).detail ?? ls());
    };
    window.addEventListener("jarvis:knowledge", onUpdate);

    dataList<KnowledgeDoc>("knowledge_docs").then((r) => {
      if (cancelled) return;
      remote.current = r.remote;
      // With a database, its rows are the list: merging the cache back in is
      // what brought deleted documents back on the next load.
      if (r.remote) {
        lsSet(r.rows);
        setDocs(r.rows);
      } else {
        setDocs(ls());
      }
      setReady(true);
    });

    return () => {
      cancelled = true;
      window.removeEventListener("jarvis:knowledge", onUpdate);
    };
  }, [userId]);

  const upload = useCallback(async (files: FileList | File[]) => {
    setUploading(true);
    const arr = Array.from(files);
    const newDocs: KnowledgeDoc[] = [];

    for (const file of arr) {
      try {
        newDocs.push(await knowledgeDocFrom(file.name, new Uint8Array(await file.arrayBuffer()), file.type));
      } catch {
        newDocs.push({
          id: crypto.randomUUID(), title: file.name, content: "", file_type: getExt(file.name).replace(".", ""),
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
    return newDocs;
  }, []);

  const syncDeviceFolder = useCallback(async (): Promise<{ count: number; supported?: boolean; promptFiles?: boolean; error?: string }> => {
    if (typeof window === "undefined") return { count: 0, error: "Window not available" };
    try {
      const w = window as any;
      if (!("showDirectoryPicker" in w)) {
        // Mobile / Safari fallback
        return { count: 0, supported: false, promptFiles: true };
      }
      const dirHandle = await w.showDirectoryPicker();
      const collectedFiles: File[] = [];
      async function scanDir(handle: any, depth = 0) {
        if (depth > 3) return;
        for await (const entry of handle.values()) {
          if (entry.kind === "file") {
            const ext = getExt(entry.name);
            if (TEXT_TYPES.has(ext) || IMAGE_TYPES.has(ext) || DOC_TYPES.has(ext)) {
              try {
                const file = await entry.getFile();
                collectedFiles.push(file);
              } catch {}
            }
          } else if (entry.kind === "directory" && !entry.name.startsWith(".")) {
            await scanDir(entry, depth + 1);
          }
        }
      }
      await scanDir(dirHandle);
      if (!collectedFiles.length) return { count: 0, error: "No readable documents, code files, or photos found in the selected folder." };
      const uploaded = await upload(collectedFiles);
      return { count: uploaded.length, supported: true };
    } catch (err: any) {
      if (err?.name === "AbortError") return { count: 0, supported: true };
      return { count: 0, supported: true, error: err?.message || "Folder selection cancelled or failed." };
    }
  }, [upload]);

  const remove = useCallback(async (id: string) => {
    setDocs((prev) => {
      const next = prev.filter((d) => d.id !== id);
      lsSet(next);
      return next;
    });
    if (remote.current) await dataDelete("knowledge_docs", id);
    fetch(`/api/cortex/ingest?docId=${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => {});
  }, []);

  const refreshFromCloud = useCallback(async (): Promise<{ count: number; error?: string }> => {
    setUploading(true);
    try {
      const r = await dataList<KnowledgeDoc>("knowledge_docs");
      remote.current = r.remote;
      const list = r.remote ? r.rows : ls();
      if (r.remote) lsSet(list);
      setDocs(list);
      setUploading(false);
      return { count: list.length };
    } catch (err: any) {
      setUploading(false);
      return { count: ls().length, error: err?.message || "Vault sync failed" };
    }
  }, []);

  return { docs, ready, uploading, upload, remove, syncDeviceFolder, refreshFromCloud };
}
