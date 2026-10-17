"use client";

import { useState } from "react";
import Link from "next/link";
import { FileText, Folder, FolderPlus, MessageSquarePlus, Pencil, Plug, Search, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ATTACHMENT_ACCEPT, MAX_ATTACHMENT_BYTES } from "@/lib/attachments";
import type { ChatSummary, Project, ProjectFile } from "@/hooks/useChatLibrary";

interface Props {
  chats: ChatSummary[];
  projects: Project[];
  activeChatId: string | null;
  activeProjectId: string | null;
  onOpen: (id: string) => void;
  onNew: (projectId: string | null) => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  onSaveProject: (p: Project) => void;
  onDeleteProject: (id: string) => void;
  onClose: () => void;
}

function readFile(f: File): Promise<ProjectFile> {
  return new Promise((ok, fail) => {
    const r = new FileReader();
    r.onload = () => ok({ name: f.name, mimeType: f.type || "text/plain", data: String(r.result).split(",")[1] ?? "", size: f.size });
    r.onerror = () => fail(r.error);
    r.readAsDataURL(f);
  });
}

function ProjectEditor({ project, onSave, onCancel, onDelete }: {
  project: Project; onSave: (p: Project) => void; onCancel: () => void; onDelete?: () => void;
}) {
  const [draft, setDraft] = useState(project);
  const [note, setNote] = useState<string | null>(null);
  const used = draft.files.reduce((n, f) => n + f.size, 0);

  async function add(list: FileList | null) {
    if (!list) return;
    let files = draft.files;
    let total = used;
    for (const f of Array.from(list)) {
      if (total + f.size > MAX_ATTACHMENT_BYTES) { setNote(`"${f.name}" doesn't fit - project files can total 3 MB.`); continue; }
      files = [...files, await readFile(f)];
      total += f.size;
    }
    setDraft((d) => ({ ...d, files }));
  }

  return (
    <div className="space-y-2 rounded-card border border-border-default bg-background-surface p-3">
      <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Project name"
        className="w-full bg-background-base border border-border-default rounded-input px-2.5 py-1.5 text-sm text-text-primary outline-none focus:border-border-hover" />
      <textarea value={draft.instructions} onChange={(e) => setDraft({ ...draft, instructions: e.target.value })} rows={4}
        placeholder="Instructions JARVIS follows in every chat of this project - goals, tone, context."
        className="w-full bg-background-base border border-border-default rounded-input px-2.5 py-1.5 text-xs text-text-primary outline-none focus:border-border-hover resize-none" />
      <div className="flex flex-wrap gap-1.5">
        {draft.files.map((f, i) => (
          <span key={i} className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-badge bg-background-base border border-border-default text-text-secondary">
            <FileText size={10} /> <span className="max-w-[120px] truncate">{f.name}</span>
            <button type="button" aria-label={`Remove ${f.name}`} onClick={() => setDraft((d) => ({ ...d, files: d.files.filter((_, j) => j !== i) }))}><X size={10} /></button>
          </span>
        ))}
        <label className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-badge border border-dashed border-border-default text-text-muted hover:text-text-secondary cursor-pointer">
          + Files
          <input type="file" multiple accept={ATTACHMENT_ACCEPT} className="hidden" onChange={(e) => void add(e.target.files)} />
        </label>
      </div>
      {note && <p className="text-[11px] text-warning">{note}</p>}
      <div className="flex items-center gap-2 pt-1">
        <button type="button" disabled={!draft.name.trim()} onClick={() => onSave({ ...draft, name: draft.name.trim(), updated_at: new Date().toISOString() })}
          className="px-3 py-1.5 rounded-input bg-accent-blue/15 border border-accent-blue/30 text-accent-blue text-xs font-medium disabled:opacity-40">Save</button>
        <button type="button" onClick={onCancel} className="px-3 py-1.5 text-xs text-text-muted hover:text-text-secondary">Cancel</button>
        {onDelete && (
          <button type="button" onClick={onDelete} className="ml-auto p-1.5 text-text-muted hover:text-accent-red" aria-label="Delete project"><Trash2 size={13} /></button>
        )}
      </div>
    </div>
  );
}

export function ChatsPanel(p: Props) {
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Project | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameText, setRenameText] = useState("");
  const q = query.trim().toLowerCase();
  const visible = p.chats.filter((c) => !q || c.title.toLowerCase().includes(q));
  const known = new Set(p.projects.map((x) => x.id));

  const row = (c: ChatSummary) => (
    <div key={c.id} className={cn("group flex items-center gap-1 rounded-input px-2 py-1.5 transition-colors",
      c.id === p.activeChatId ? "bg-accent-blue/10 text-accent-blue" : "text-text-secondary hover:bg-background-surface hover:text-text-primary")}>
      {renaming === c.id ? (
        <input autoFocus value={renameText} onChange={(e) => setRenameText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && renameText.trim()) { p.onRename(c.id, renameText.trim()); setRenaming(null); }
            if (e.key === "Escape") setRenaming(null);
          }}
          onBlur={() => setRenaming(null)}
          className="flex-1 min-w-0 bg-background-base border border-border-default rounded px-1.5 py-0.5 text-xs text-text-primary outline-none" />
      ) : (
        <button type="button" onClick={() => p.onOpen(c.id)} className="flex-1 min-w-0 text-left text-xs truncate">{c.title || "Untitled chat"}</button>
      )}
      <button type="button" aria-label="Rename chat" onClick={() => { setRenaming(c.id); setRenameText(c.title); }}
        className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-1 text-text-muted hover:text-text-primary"><Pencil size={11} /></button>
      <button type="button" aria-label="Delete chat" onClick={() => p.onDelete(c.id)}
        className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-1 text-text-muted hover:text-accent-red"><Trash2 size={11} /></button>
    </div>
  );

  const loose = visible.filter((c) => !c.project_id || !known.has(c.project_id));

  return (
    <aside className="absolute inset-y-0 left-0 z-40 w-[85%] max-w-xs flex flex-col bg-background-elevated border-r border-border-default shadow-2xl">
      <div className="flex items-center gap-2 px-3 py-3 border-b border-border-default">
        <span className="text-sm font-semibold text-text-primary flex-1">Chats</span>
        <button type="button" onClick={() => p.onNew(null)} title="New chat" aria-label="New chat"
          className="p-1.5 rounded-input text-accent-blue hover:bg-accent-blue/10"><MessageSquarePlus size={15} /></button>
        <button type="button" onClick={p.onClose} aria-label="Close chats" className="p-1.5 rounded-input text-text-muted hover:text-text-primary"><X size={15} /></button>
      </div>
      <div className="px-3 py-2">
        <div className="flex items-center gap-2 bg-background-surface border border-border-default rounded-input px-2.5 py-1.5">
          <Search size={12} className="text-text-muted" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search chats"
            className="flex-1 bg-transparent text-xs text-text-primary outline-none placeholder:text-text-muted" />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-4 space-y-4">
        <section>
          <div className="flex items-center justify-between px-1 mb-1">
            <span className="hud-label text-text-muted">Projects</span>
            <button type="button" onClick={() => setEditing({ id: crypto.randomUUID(), name: "", instructions: "", files: [], updated_at: "" })}
              title="New project" aria-label="New project" className="p-1 text-text-muted hover:text-accent-blue"><FolderPlus size={13} /></button>
          </div>
          {editing && !p.projects.some((x) => x.id === editing.id) && (
            <ProjectEditor project={editing} onCancel={() => setEditing(null)} onSave={(proj) => { p.onSaveProject(proj); setEditing(null); }} />
          )}
          {p.projects.map((proj) => (
            <div key={proj.id} className="mb-1">
              {editing?.id === proj.id ? (
                <ProjectEditor project={editing} onCancel={() => setEditing(null)}
                  onSave={(next) => { p.onSaveProject(next); setEditing(null); }}
                  onDelete={() => { p.onDeleteProject(proj.id); setEditing(null); }} />
              ) : (
                <div className={cn("group flex items-center gap-1.5 rounded-input px-2 py-1.5",
                  proj.id === p.activeProjectId ? "text-accent-blue" : "text-text-primary")}>
                  <Folder size={13} className="flex-none" />
                  <button type="button" onClick={() => p.onNew(proj.id)} title="New chat in this project"
                    className="flex-1 min-w-0 text-left text-xs font-medium truncate">{proj.name}</button>
                  <button type="button" aria-label="Edit project" onClick={() => setEditing(proj)}
                    className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-1 text-text-muted hover:text-text-primary"><Pencil size={11} /></button>
                </div>
              )}
              <div className="pl-4">{visible.filter((c) => c.project_id === proj.id).map(row)}</div>
            </div>
          ))}
          {!p.projects.length && !editing && <p className="px-2 text-[11px] text-text-muted">Group chats with shared instructions and files.</p>}
        </section>
        <section>
          <span className="hud-label text-text-muted px-1">Recent</span>
          <div className="mt-1">{loose.map(row)}</div>
          {!loose.length && <p className="px-2 text-[11px] text-text-muted">{q ? "No matching chats." : "Your chats will appear here."}</p>}
        </section>
      </div>
      <Link href="/connectors" className="flex items-center gap-2 px-4 py-3 border-t border-border-default text-xs text-text-secondary hover:text-text-primary">
        <Plug size={13} /> Connectors - Gmail, Calendar, GitHub and more
      </Link>
    </aside>
  );
}
