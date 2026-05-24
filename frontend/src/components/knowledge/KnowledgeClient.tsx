"use client";

import { useRef, useCallback, DragEvent, useState } from "react";
import { Upload, FileText, Trash2, Search, AlertCircle, CheckCircle2, BookOpen, Download } from "lucide-react";
import { cn, formatRelativeTime } from "@/lib/utils";
import { useLocalKnowledge, searchDocs, type SearchResult } from "@/hooks/useLocalKnowledge";

export function KnowledgeClient() {
  const { docs, ready, uploading, upload, remove } = useLocalKnowledge();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);

  const handleFiles = useCallback((files: FileList | null) => {
    if (!files || files.length === 0) return;
    upload(files);
  }, [upload]);

  function onDragOver(e: DragEvent<HTMLDivElement>) { e.preventDefault(); setIsDragging(true); }
  function onDragLeave(e: DragEvent<HTMLDivElement>) { e.preventDefault(); setIsDragging(false); }
  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault(); setIsDragging(false);
    upload(e.dataTransfer?.files ?? new DataTransfer().files);
  }

  function handleSearch() {
    const q = searchQuery.trim();
    if (!q) return;
    setSearching(true);
    const r = searchDocs(docs, q, 5);
    setResults(r);
    setSearching(false);
  }

  function downloadDoc(doc: typeof docs[0]) {
    const ext = doc.file_type ?? "txt";
    const blob = new Blob([doc.content], { type: "text/plain" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = doc.title.endsWith(`.${ext}`) ? doc.title : `${doc.title}.${ext}`;
    a.click(); URL.revokeObjectURL(a.href);
  }

  function exportAll() {
    const combined = docs.map((d) => `=== ${d.title} ===\n\n${d.content}`).join("\n\n" + "=".repeat(60) + "\n\n");
    const blob = new Blob([combined], { type: "text/plain" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = `thirdeye-knowledge-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click(); URL.revokeObjectURL(a.href);
  }

  if (!ready) return (
    <div className="flex justify-center py-20">
      <div className="w-4 h-4 border-2 border-accent-blue/20 border-t-accent-blue rounded-full animate-spin" />
    </div>
  );

  const readyCount = docs.filter((d) => d.processing_status === "ready").length;
  const totalChunks = docs.reduce((s, d) => s + d.chunk_count, 0);

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Stats */}
      {docs.length > 0 && (
        <div className="flex gap-3 flex-wrap">
          <StatChip label="Documents" value={docs.length} />
          <StatChip label="Ready" value={readyCount} color="green" />
          <StatChip label="Chunks indexed" value={totalChunks} color="blue" />
        </div>
      )}

      {/* Upload Zone */}
      <div
        onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
        className={cn(
          "border-2 border-dashed rounded-card px-6 py-10 text-center transition-colors cursor-pointer",
          isDragging ? "border-accent-blue bg-accent-blue/5" : "border-border-default hover:border-border-hover bg-background-surface"
        )}
      >
        <input
          ref={fileInputRef} type="file" multiple
          accept=".txt,.md,.markdown,.csv,.json,.js,.ts,.py,.html,.xml,.yaml,.yml"
          onChange={(e) => handleFiles(e.target.files)} className="hidden"
        />
        <Upload size={28} className="mx-auto text-text-muted mb-3" />
        <p className="text-text-primary text-sm font-medium">
          {uploading ? "Processing…" : isDragging ? "Drop to upload" : "Drag & drop files or click to browse"}
        </p>
        <p className="text-text-muted text-xs mt-2 font-mono">
          TXT · MD · CSV · JSON · TS · PY · HTML · YAML
        </p>
        {uploading && (
          <div className="mt-3 flex justify-center">
            <div className="w-4 h-4 border-2 border-accent-blue/20 border-t-accent-blue rounded-full animate-spin" />
          </div>
        )}
      </div>

      {/* Search */}
      <div className="bg-background-surface border border-border-default rounded-card">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border-default">
          <Search size={15} className="text-text-muted flex-none" />
          <input
            type="text" value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder="Search across your documents…"
            className="flex-1 bg-transparent text-text-primary placeholder:text-text-muted text-sm outline-none"
          />
          <button
            onClick={handleSearch}
            disabled={!searchQuery.trim() || searching || readyCount === 0}
            className="text-accent-blue text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:text-accent-blue/80 transition-colors"
          >
            {searching ? "Searching…" : "Search"}
          </button>
        </div>

        {results !== null && (
          <div className="px-4 py-3 space-y-3">
            <p className="text-text-muted text-xs font-mono">{results.length} results</p>
            {results.length === 0 ? (
              <p className="text-text-muted text-sm py-3">No matching passages found.</p>
            ) : (
              results.map((r, i) => (
                <div key={`${r.doc_id}-${r.chunk_index}`}
                  className="bg-background-elevated border border-border-default rounded-input px-4 py-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-accent-blue text-xs font-mono">[{i + 1}] {r.doc_title}</span>
                    <span className="text-text-muted text-xs font-mono">chunk {r.chunk_index} · score {r.score}</span>
                  </div>
                  <p className="text-text-primary text-sm leading-relaxed line-clamp-4">{r.content}</p>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Document List */}
      <div className="bg-background-surface border border-border-default rounded-card">
        <div className="px-5 py-4 border-b border-border-default flex items-center justify-between">
          <h2 className="text-text-primary font-medium text-sm">Documents</h2>
          <div className="flex items-center gap-3">
            {docs.length > 0 && (
              <button onClick={exportAll} className="flex items-center gap-1 text-text-muted hover:text-[#4FC3F7] text-xs font-mono transition-colors">
                <Download size={11} /> Export all
              </button>
            )}
            <span className="text-text-muted text-xs font-mono">{docs.length} total</span>
          </div>
        </div>

        {docs.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <BookOpen size={24} className="mx-auto text-text-muted opacity-40 mb-3" />
            <p className="text-text-muted text-sm">No documents yet. Upload one above.</p>
            <p className="text-text-muted text-xs mt-1">Your AI will search them when you ask questions.</p>
          </div>
        ) : (
          <ul className="divide-y divide-border-default">
            {docs.map((doc) => (
              <li key={doc.id}
                className="px-5 py-3 flex items-center gap-4 hover:bg-background-elevated transition-colors group">
                <FileText size={15} className="text-text-muted flex-none" />
                <div className="flex-1 min-w-0">
                  <p className="text-text-primary text-sm truncate">{doc.title}</p>
                  <p className="text-text-muted text-xs font-mono mt-0.5">
                    {doc.file_type?.toUpperCase()} · {Math.round(doc.file_size_bytes / 1024)} KB
                    {doc.processing_status === "ready" && ` · ${doc.chunk_count} chunks`}
                    {doc.error && ` · ${doc.error}`}
                  </p>
                </div>
                <span className={cn("text-xs flex items-center gap-1.5 flex-none",
                  doc.processing_status === "ready" ? "text-success" : "text-accent-red")}>
                  {doc.processing_status === "ready"
                    ? <><CheckCircle2 size={12} /> Ready</>
                    : <><AlertCircle size={12} /> Failed</>}
                </span>
                <span className="text-text-muted text-xs flex-none">{formatRelativeTime(doc.created_at)}</span>
                <button onClick={() => downloadDoc(doc)}
                  className="flex-none text-text-muted hover:text-[#4FC3F7] opacity-0 group-hover:opacity-100 transition-all"
                  title="Download">
                  <Download size={13} />
                </button>
                <button onClick={() => remove(doc.id)}
                  className="flex-none text-text-muted hover:text-accent-red opacity-0 group-hover:opacity-100 transition-all"
                  title="Delete">
                  <Trash2 size={13} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function StatChip({ label, value, color }: { label: string; value: number; color?: string }) {
  const cls = color === "green" ? "text-success" : color === "blue" ? "text-accent-blue" : "text-text-primary";
  return (
    <div className="bg-background-surface border border-border-default rounded-card px-4 py-2 flex items-center gap-2">
      <span className={cn("font-display text-lg font-bold", cls)}>{value}</span>
      <span className="text-text-muted text-xs">{label}</span>
    </div>
  );
}
