"use client";

import { useState, useRef, useCallback, DragEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  deleteDocument,
  fetchDocuments,
  searchKnowledge,
  uploadDocument,
} from "@/lib/api";
import {
  Upload,
  FileText,
  Trash2,
  Search,
  Loader2,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { cn, formatRelativeTime } from "@/lib/utils";
import type { Document, KnowledgeSearchResponse } from "@/types";

const STATUS_DISPLAY: Record<string, { label: string; color: string }> = {
  pending: { label: "Pending", color: "text-text-muted" },
  parsing: { label: "Parsing", color: "text-warning" },
  chunking: { label: "Chunking", color: "text-warning" },
  embedding: { label: "Embedding", color: "text-warning" },
  ready: { label: "Ready", color: "text-success" },
  failed: { label: "Failed", color: "text-accent-red" },
};

export function KnowledgeClient() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<KnowledgeSearchResponse | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const { data: documents = [], isLoading } = useQuery({
    queryKey: ["documents"],
    queryFn: fetchDocuments,
    refetchInterval: (q) => {
      const data = q.state.data as Document[] | undefined;
      const hasProcessing = data?.some(
        (d) => !["ready", "failed"].includes(d.processing_status)
      );
      return hasProcessing ? 2000 : false;
    },
  });

  const uploadMutation = useMutation({
    mutationFn: uploadDocument,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      setUploadError(null);
    },
    onError: (err: any) => {
      setUploadError(err?.response?.data?.detail ?? "Upload failed");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteDocument,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["documents"] }),
  });

  const searchMutation = useMutation({
    mutationFn: (q: string) => searchKnowledge(q, 5),
    onSuccess: (data) => setSearchResults(data),
  });

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (!files || files.length === 0) return;
      for (const file of Array.from(files)) {
        uploadMutation.mutate(file);
      }
    },
    [uploadMutation]
  );

  function onDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(true);
  }

  function onDragLeave(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    handleFiles(e.dataTransfer?.files ?? null);
  }

  function handleSearch() {
    const q = searchQuery.trim();
    if (!q) return;
    searchMutation.mutate(q);
  }

  return (
    <div className="space-y-6">
      {/* Upload Zone */}
      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
        className={cn(
          "border-2 border-dashed rounded-card px-6 py-10 text-center transition-colors cursor-pointer",
          isDragging
            ? "border-accent-blue bg-accent-blue/5"
            : "border-border-default hover:border-border-hover bg-background-surface"
        )}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.docx,.xlsx,.csv,.txt,.md,.markdown"
          onChange={(e) => handleFiles(e.target.files)}
          className="hidden"
        />
        <Upload size={28} className="mx-auto text-text-muted mb-3" />
        <p className="text-text-primary text-sm font-medium">
          {isDragging ? "Drop to upload" : "Drag and drop files or click to browse"}
        </p>
        <p className="text-text-muted text-xs mt-2 font-mono">
          PDF · DOCX · XLSX · CSV · TXT · Markdown · max 50 MB
        </p>
        {uploadMutation.isPending && (
          <p className="text-accent-blue text-xs mt-3 flex items-center justify-center gap-2">
            <Loader2 size={12} className="animate-spin" />
            Uploading…
          </p>
        )}
        {uploadError && (
          <p className="text-accent-red text-xs mt-3">{uploadError}</p>
        )}
      </div>

      {/* Search */}
      <div className="bg-background-surface border border-border-default rounded-card">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border-default">
          <Search size={15} className="text-text-muted flex-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder="Ask a question about your documents…"
            className="flex-1 bg-transparent text-text-primary placeholder:text-text-muted text-sm outline-none"
          />
          <button
            onClick={handleSearch}
            disabled={!searchQuery.trim() || searchMutation.isPending}
            className="text-accent-blue text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:text-accent-blue/80 transition-colors"
          >
            {searchMutation.isPending ? "Searching…" : "Search"}
          </button>
        </div>

        {searchResults && (
          <div className="px-4 py-3 space-y-3">
            <p className="text-text-muted text-xs font-mono">
              {searchResults.results.length} results · {searchResults.latency_ms}ms
            </p>
            {searchResults.results.length === 0 ? (
              <p className="text-text-muted text-sm py-3">
                No matching passages found.
              </p>
            ) : (
              searchResults.results.map((r, i) => (
                <div
                  key={`${r.document_id}-${r.chunk_index}`}
                  className="bg-background-elevated border border-border-default rounded-input px-4 py-3"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-accent-blue text-xs font-mono">
                      [{i + 1}] {r.document_title}
                    </span>
                    <span className="text-text-muted text-xs font-mono">
                      chunk {r.chunk_index} · {(r.score * 100).toFixed(0)}%
                    </span>
                  </div>
                  <p className="text-text-primary text-sm leading-relaxed line-clamp-4">
                    {r.content}
                  </p>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Documents List */}
      <div className="bg-background-surface border border-border-default rounded-card">
        <div className="px-5 py-4 border-b border-border-default flex items-center justify-between">
          <h2 className="text-text-primary font-medium text-sm">Documents</h2>
          <span className="text-text-muted text-xs font-mono">
            {documents.length} total
          </span>
        </div>

        {isLoading ? (
          <div className="px-5 py-8 text-center text-text-muted text-sm">
            Loading…
          </div>
        ) : documents.length === 0 ? (
          <div className="px-5 py-8 text-center text-text-muted text-sm">
            No documents yet. Upload one above to get started.
          </div>
        ) : (
          <ul className="divide-y divide-border-default">
            {documents.map((doc) => {
              const status =
                STATUS_DISPLAY[doc.processing_status] ?? STATUS_DISPLAY.pending;
              return (
                <li
                  key={doc.id}
                  className="px-5 py-3 flex items-center gap-4 hover:bg-background-elevated transition-colors group"
                >
                  <FileText size={15} className="text-text-muted flex-none" />
                  <div className="flex-1 min-w-0">
                    <p className="text-text-primary text-sm truncate">
                      {doc.title}
                    </p>
                    <p className="text-text-muted text-xs font-mono mt-0.5">
                      {doc.file_type?.toUpperCase()} ·{" "}
                      {doc.file_size_bytes
                        ? `${Math.round(doc.file_size_bytes / 1024)} KB`
                        : ""}
                      {doc.processing_status === "ready" &&
                        ` · ${doc.chunk_count} chunks`}
                    </p>
                  </div>
                  <span
                    className={cn("text-xs flex items-center gap-1.5 flex-none", status.color)}
                  >
                    {doc.processing_status === "ready" ? (
                      <CheckCircle2 size={12} />
                    ) : doc.processing_status === "failed" ? (
                      <AlertCircle size={12} />
                    ) : (
                      <Loader2 size={12} className="animate-spin" />
                    )}
                    {status.label}
                  </span>
                  <span className="text-text-muted text-xs flex-none">
                    {formatRelativeTime(doc.created_at)}
                  </span>
                  <button
                    onClick={() => deleteMutation.mutate(doc.id)}
                    className="flex-none text-text-muted hover:text-accent-red opacity-0 group-hover:opacity-100 transition-all"
                    title="Delete document"
                  >
                    <Trash2 size={13} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
