"use client";

import { useState, useRef, KeyboardEvent } from "react";
import { useLocalNotes, LocalNote } from "@/hooks/useLocalNotes";
import { Plus, Trash2, Pin, PinOff, Search, X, Download } from "lucide-react";
import { cn, formatRelativeTime } from "@/lib/utils";

export function NotesClient() {
  const { notes, ready, create, update, remove } = useLocalNotes();
  const [active, setActive] = useState<LocalNote | null>(null);
  const [search, setSearch] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const textRef = useRef<HTMLTextAreaElement>(null);

  const filtered = notes.filter((n) =>
    !search || n.title.toLowerCase().includes(search.toLowerCase()) || n.content.toLowerCase().includes(search.toLowerCase())
  );
  const pinned = filtered.filter((n) => n.pinned);
  const rest = filtered.filter((n) => !n.pinned);

  async function handleNew() {
    const title = newTitle.trim() || "Untitled";
    const note = await create(title);
    setNewTitle("");
    setActive(note);
  }

  function handleKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") handleNew();
  }

  function handleBodyChange(content: string) {
    if (!active) return;
    update(active.id, { content });
    setActive((prev) => prev ? { ...prev, content } : null);
  }

  function handleTitleChange(title: string) {
    if (!active) return;
    update(active.id, { title });
    setActive((prev) => prev ? { ...prev, title } : null);
  }

  function exportNotes() {
    const md = notes.map((n) => `# ${n.title}\n\n${n.content}\n\n---\n`).join("\n");
    const blob = new Blob([md], { type: "text/markdown" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = `thirdeye-notes-${new Date().toISOString().slice(0, 10)}.md`;
    a.click(); URL.revokeObjectURL(a.href);
  }

  function downloadNote() {
    if (!active) return;
    const blob = new Blob([`# ${active.title}\n\n${active.content}`], { type: "text/markdown" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = `${active.title.replace(/[^a-zA-Z0-9]/g, "_")}.md`;
    a.click(); URL.revokeObjectURL(a.href);
  }

  if (!ready) return <div className="flex justify-center py-20"><div className="w-4 h-4 border-2 border-accent-blue/20 border-t-accent-blue rounded-full animate-spin" /></div>;

  return (
    <div className="flex gap-5 h-[calc(100vh-160px)] min-h-[400px]">
      {/* Sidebar */}
      <div className="w-64 flex-none flex flex-col gap-3">
        {/* New note */}
        <div className="flex gap-2">
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={handleKey}
            placeholder="New note title…"
            className="flex-1 bg-background-surface border border-border-default rounded-input px-3 py-2 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-accent-blue/50 transition-colors"
          />
          <button onClick={handleNew}
            className="px-3 py-2 rounded-input bg-accent-blue/10 border border-accent-blue/30 text-accent-blue hover:bg-accent-blue/20 transition-colors">
            <Plus size={14} />
          </button>
        </div>

        {/* Search */}
        <div className="flex items-center gap-2 bg-background-surface border border-border-default rounded-input px-3 py-2">
          <Search size={13} className="text-text-muted flex-none" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search notes…"
            className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-muted outline-none" />
          {search && <button onClick={() => setSearch("")}><X size={11} className="text-text-muted" /></button>}
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto space-y-1">
          {notes.length === 0 && (
            <p className="text-text-muted text-xs text-center py-8">No notes yet. Create one above or ask your AI to take a note.</p>
          )}
          {pinned.length > 0 && (
            <>
              <p className="text-[10px] font-mono text-text-muted px-2 py-1 uppercase tracking-widest">Pinned</p>
              {pinned.map((n) => <NoteRow key={n.id} note={n} active={active?.id === n.id} onClick={() => setActive(n)} onPin={() => update(n.id, { pinned: !n.pinned })} onDelete={() => { remove(n.id); if (active?.id === n.id) setActive(null); }} />)}
              <div className="border-t border-border-default my-1" />
            </>
          )}
          {rest.map((n) => <NoteRow key={n.id} note={n} active={active?.id === n.id} onClick={() => setActive(n)} onPin={() => update(n.id, { pinned: !n.pinned })} onDelete={() => { remove(n.id); if (active?.id === n.id) setActive(null); }} />)}
        </div>

        <div className="flex items-center justify-between">
          <p className="text-[10px] text-text-muted font-mono">{notes.length} notes</p>
          {notes.length > 0 && (
            <button onClick={exportNotes} className="flex items-center gap-1 text-[10px] text-text-muted hover:text-[#4FC3F7] transition-colors font-mono">
              <Download size={10} /> Export all
            </button>
          )}
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 flex flex-col bg-background-surface border border-border-default rounded-card overflow-hidden">
        {active ? (
          <>
            <div className="px-6 py-4 border-b border-border-default">
              <input
                value={active.title}
                onChange={(e) => handleTitleChange(e.target.value)}
                className="w-full bg-transparent text-text-primary font-semibold text-lg outline-none placeholder:text-text-muted"
                placeholder="Note title…"
              />
              <div className="flex items-center gap-2 mt-1">
                <p className="text-text-muted text-xs font-mono">{formatRelativeTime(active.updated_at)}</p>
                <button onClick={downloadNote} className="flex items-center gap-1 text-text-muted hover:text-[#4FC3F7] text-xs transition-colors">
                  <Download size={10} /> Download
                </button>
              </div>
            </div>
            <textarea
              ref={textRef}
              value={active.content}
              onChange={(e) => handleBodyChange(e.target.value)}
              placeholder="Start writing… Your AI can also add notes for you via the Assistant."
              className="flex-1 w-full bg-transparent text-text-primary text-sm leading-relaxed resize-none outline-none px-6 py-5 placeholder:text-text-muted"
            />
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <p className="text-text-muted text-sm">Select a note or create a new one.</p>
              <p className="text-text-muted text-xs mt-1">You can also ask your AI: &quot;Take a note about X&quot;</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function NoteRow({ note, active, onClick, onPin, onDelete }: {
  note: LocalNote; active: boolean;
  onClick: () => void; onPin: () => void; onDelete: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "flex items-start gap-2 px-3 py-2.5 rounded-input cursor-pointer transition-colors group",
        active ? "bg-accent-blue/10 border border-accent-blue/20" : "hover:bg-background-elevated border border-transparent"
      )}
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm text-text-primary truncate">{note.title}</p>
        <p className="text-xs text-text-muted truncate">{note.content.slice(0, 40) || "Empty"}</p>
      </div>
      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-none pt-0.5">
        <button onClick={(e) => { e.stopPropagation(); onPin(); }} title={note.pinned ? "Unpin" : "Pin"}
          className="text-text-muted hover:text-accent-violet transition-colors">
          {note.pinned ? <PinOff size={11} /> : <Pin size={11} />}
        </button>
        <button onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="text-text-muted hover:text-accent-red transition-colors">
          <Trash2 size={11} />
        </button>
      </div>
    </div>
  );
}
