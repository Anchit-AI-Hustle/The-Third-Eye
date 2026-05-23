"use client";

import { useState, useRef } from "react";
import { useLocalTasks, LocalTask, TaskStatus, TaskPriority, TeamMember } from "@/hooks/useLocalTasks";
import {
  Plus, Search, Download, Upload, Users, X, ChevronDown, Edit2, Trash2,
  LayoutGrid, List, AlertCircle, Check,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────────────────────

type ViewMode = "table" | "kanban";
type SortKey = "title" | "assignee" | "start_date" | "due_date" | "priority" | "status";

const STATUS_OPTIONS: { value: TaskStatus; label: string }[] = [
  { value: "todo", label: "To Do" },
  { value: "in_progress", label: "In Progress" },
  { value: "done", label: "Done" },
  { value: "cancelled", label: "Cancelled" },
];

const PRIORITY_OPTIONS: { value: TaskPriority; label: string }[] = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
];

const PRIORITY_STYLE: Record<TaskPriority, string> = {
  low:    "bg-text-muted/10 text-text-muted border border-text-muted/20",
  medium: "bg-warning/10 text-warning border border-warning/30",
  high:   "bg-accent-red/10 text-accent-red border border-accent-red/30",
  urgent: "bg-accent-red/20 text-accent-red border border-accent-red/50 font-semibold",
};

const STATUS_STYLE: Record<TaskStatus, string> = {
  todo:       "bg-background-elevated text-text-secondary border border-border-default",
  in_progress:"bg-accent-blue/10 text-accent-blue border border-accent-blue/30",
  done:       "bg-success/10 text-success border border-success/30",
  cancelled:  "bg-accent-red/10 text-accent-red border border-accent-red/20",
};

function isOverdue(due?: string, status?: TaskStatus): boolean {
  if (!due || status === "done" || status === "cancelled") return false;
  return new Date(due) < new Date(new Date().toDateString());
}

function fmtDate(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ─── Empty form ──────────────────────────────────────────────────────────────

function emptyForm(): Omit<LocalTask, "id" | "created_at"> {
  return { title: "", description: "", assignee: "", status: "todo", priority: "medium",
    start_date: "", due_date: "", completed_at: "" };
}

// ─── Main component ──────────────────────────────────────────────────────────

export function TasksClient() {
  const { allTasks, team, ready, create, update, remove, addMember, removeMember } =
    useLocalTasks();

  const [view, setView] = useState<ViewMode>("table");
  const [search, setSearch] = useState("");
  const [filterAssignee, setFilterAssignee] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterPriority, setFilterPriority] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("due_date");
  const [sortAsc, setSortAsc] = useState(true);

  const [showModal, setShowModal] = useState(false);
  const [editTask, setEditTask] = useState<LocalTask | null>(null);
  const [showTeam, setShowTeam] = useState(false);
  const [newMemberName, setNewMemberName] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  // ── Filtering ─────────────────────────────────────────────────────────────
  const filtered = allTasks
    .filter((t) => {
      if (search && !t.title.toLowerCase().includes(search.toLowerCase()) &&
          !t.assignee?.toLowerCase().includes(search.toLowerCase())) return false;
      if (filterAssignee && t.assignee !== filterAssignee) return false;
      if (filterStatus && t.status !== filterStatus) return false;
      if (filterPriority && t.priority !== filterPriority) return false;
      return true;
    })
    .sort((a, b) => {
      let av = (a as any)[sortKey] ?? "";
      let bv = (b as any)[sortKey] ?? "";
      if (!av && bv) return sortAsc ? 1 : -1;
      if (av && !bv) return sortAsc ? -1 : 1;
      return sortAsc ? (av < bv ? -1 : 1) : (av > bv ? -1 : 1);
    });

  // ── Export CSV ────────────────────────────────────────────────────────────
  function exportCSV() {
    const header = "Title,Assignee,Priority,Status,Start Date,Due Date,Completed";
    const rows = allTasks.map((t) =>
      [t.title, t.assignee ?? "", t.priority, t.status,
       t.start_date ?? "", t.due_date ?? "", t.completed_at ?? ""]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(",")
    );
    const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = `jarvis-actions-${new Date().toISOString().slice(0,10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  // ── Import CSV ────────────────────────────────────────────────────────────
  function importCSV(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const lines = (e.target?.result as string).split("\n").slice(1);
      lines.forEach((line) => {
        const [title, assignee, priority, status, start_date, due_date, completed_at] =
          line.split(",").map((v) => v.replace(/^"|"$/g, "").replace(/""/g, '"'));
        if (!title?.trim()) return;
        create({
          title: title.trim(), assignee, status: (status as TaskStatus) || "todo",
          priority: (priority as TaskPriority) || "medium",
          start_date: start_date || undefined, due_date: due_date || undefined,
          completed_at: completed_at || undefined,
        });
      });
    };
    reader.readAsText(file);
  }

  function openNew() { setEditTask(null); setShowModal(true); }
  function openEdit(t: LocalTask) { setEditTask(t); setShowModal(true); }

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortAsc((v) => !v);
    else { setSortKey(key); setSortAsc(true); }
  }

  const uniqueAssignees = Array.from(new Set(allTasks.map((t) => t.assignee).filter(Boolean))) as string[];

  if (!ready) {
    return <div className="flex justify-center py-20"><div className="w-5 h-5 border-2 border-accent-blue/20 border-t-accent-blue rounded-full animate-spin" /></div>;
  }

  return (
    <div className="space-y-4">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2.5">
          <div className="w-2 h-2 rounded-full bg-success" />
          <span className="text-text-muted text-sm font-mono">{allTasks.length} actions</span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={exportCSV} className={btn}>
            <Download size={13} /> Export
          </button>
          <button onClick={() => fileRef.current?.click()} className={btn}>
            <Upload size={13} /> Import
          </button>
          <input ref={fileRef} type="file" accept=".csv" className="hidden"
            onChange={(e) => e.target.files?.[0] && importCSV(e.target.files[0])} />
          <button onClick={() => setShowTeam(true)} className={btn}>
            <Users size={13} /> Team
            {team.length > 0 && (
              <span className="ml-0.5 text-[10px] font-mono bg-accent-violet/20 text-accent-violet px-1.5 py-0.5 rounded">
                {team.length}
              </span>
            )}
          </button>
          <button onClick={openNew}
            className="flex items-center gap-1.5 px-3 py-2 rounded-input bg-accent-blue text-white text-sm font-medium hover:bg-accent-blue/90 transition-colors">
            <Plus size={14} /> New Action
          </button>
        </div>
      </div>

      {/* ── Search + Filters ───────────────────────────────────────────── */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex-1 min-w-[200px] flex items-center gap-2 bg-background-surface border border-border-default rounded-card px-3 py-2.5 focus-within:border-border-hover transition-colors">
          <Search size={14} className="text-text-muted flex-none" />
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search actions…"
            className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-muted outline-none" />
          {search && <button onClick={() => setSearch("")}><X size={12} className="text-text-muted hover:text-text-primary" /></button>}
        </div>

        <FilterSelect value={filterAssignee} onChange={setFilterAssignee}
          options={[{ value: "", label: "All assignees" }, ...uniqueAssignees.map((a) => ({ value: a, label: a }))]} />
        <FilterSelect value={filterStatus} onChange={setFilterStatus}
          options={[{ value: "", label: "All statuses" }, ...STATUS_OPTIONS.map((s) => ({ value: s.value, label: s.label }))]} />
        <FilterSelect value={filterPriority} onChange={setFilterPriority}
          options={[{ value: "", label: "All priorities" }, ...PRIORITY_OPTIONS.map((p) => ({ value: p.value, label: p.label }))]} />

        <div className="flex rounded-card border border-border-default overflow-hidden">
          <button onClick={() => setView("table")} className={cn("px-3 py-2 text-xs flex items-center gap-1.5 transition-colors",
            view === "table" ? "bg-accent-blue text-white" : "bg-background-surface text-text-secondary hover:text-text-primary")}>
            <List size={13} /> Table
          </button>
          <button onClick={() => setView("kanban")} className={cn("px-3 py-2 text-xs flex items-center gap-1.5 transition-colors border-l border-border-default",
            view === "kanban" ? "bg-accent-blue text-white" : "bg-background-surface text-text-secondary hover:text-text-primary")}>
            <LayoutGrid size={13} /> Kanban
          </button>
        </div>
      </div>

      {/* ── View ───────────────────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <EmptyState hasFilters={!!(search || filterAssignee || filterStatus || filterPriority)} onNew={openNew} />
      ) : view === "table" ? (
        <TableView tasks={filtered} sortKey={sortKey} sortAsc={sortAsc}
          onSort={handleSort} onEdit={openEdit} onDelete={remove} />
      ) : (
        <KanbanView tasks={filtered} onEdit={openEdit} onStatusChange={(id, s) => update(id, { status: s })} />
      )}

      {/* ── Modals ─────────────────────────────────────────────────────── */}
      {showModal && (
        <ActionModal
          task={editTask}
          team={team}
          onSave={(data) => {
            if (editTask) update(editTask.id, data);
            else create(data);
            setShowModal(false);
          }}
          onClose={() => setShowModal(false)}
        />
      )}
      {showTeam && (
        <TeamModal
          team={team}
          newName={newMemberName}
          onNameChange={setNewMemberName}
          onAdd={() => { if (newMemberName.trim()) { addMember(newMemberName); setNewMemberName(""); } }}
          onRemove={removeMember}
          onClose={() => setShowTeam(false)}
        />
      )}
    </div>
  );
}

// ─── Table view ───────────────────────────────────────────────────────────────

function TableView({ tasks, sortKey, sortAsc, onSort, onEdit, onDelete }: {
  tasks: LocalTask[];
  sortKey: string;
  sortAsc: boolean;
  onSort: (k: any) => void;
  onEdit: (t: LocalTask) => void;
  onDelete: (id: string) => void;
}) {
  const TH = ({ label, k }: { label: string; k?: string }) => (
    <th className={cn(
      "text-left text-xs text-text-muted font-medium px-4 py-3 select-none whitespace-nowrap",
      k && "cursor-pointer hover:text-text-secondary"
    )} onClick={() => k && onSort(k)}>
      {label}{k && sortKey === k ? (sortAsc ? " ↑" : " ↓") : ""}
    </th>
  );

  return (
    <div className="bg-background-surface border border-border-default rounded-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-border-default bg-background-elevated/50">
            <tr>
              <TH label="Action" k="title" />
              <TH label="Assignee" k="assignee" />
              <TH label="Started" k="start_date" />
              <TH label="Due" k="due_date" />
              <TH label="Completed" k="completed_at" />
              <TH label="Priority" k="priority" />
              <TH label="Status" k="status" />
              <th className="w-16" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border-default">
            {tasks.map((t) => {
              const overdue = isOverdue(t.due_date, t.status);
              return (
                <tr key={t.id} className="hover:bg-background-elevated/50 transition-colors group">
                  <td className="px-4 py-3 max-w-[320px]">
                    <p className="text-text-primary leading-snug line-clamp-2">{t.title}</p>
                    {t.description && <p className="text-text-muted text-xs mt-0.5 truncate">{t.description}</p>}
                  </td>
                  <td className="px-4 py-3 text-text-secondary whitespace-nowrap">{t.assignee || "—"}</td>
                  <td className="px-4 py-3 text-text-muted whitespace-nowrap">{fmtDate(t.start_date)}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {t.due_date ? (
                      <span className={cn("leading-tight", overdue ? "text-accent-red" : "text-text-secondary")}>
                        {fmtDate(t.due_date)}
                        {overdue && <span className="block text-[10px]">(overdue)</span>}
                      </span>
                    ) : <span className="text-text-muted">—</span>}
                  </td>
                  <td className="px-4 py-3 text-text-muted whitespace-nowrap">{fmtDate(t.completed_at)}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <PriorityBadge priority={t.priority} />
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <StatusBadge status={t.status} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => onEdit(t)} className="text-text-muted hover:text-accent-blue transition-colors" title="Edit">
                        <Edit2 size={13} />
                      </button>
                      <button onClick={() => onDelete(t.id)} className="text-text-muted hover:text-accent-red transition-colors" title="Delete">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Kanban view ──────────────────────────────────────────────────────────────

const KANBAN_COLS: { status: TaskStatus; label: string }[] = [
  { status: "todo", label: "To Do" },
  { status: "in_progress", label: "In Progress" },
  { status: "done", label: "Done" },
];

function KanbanView({ tasks, onEdit, onStatusChange }: {
  tasks: LocalTask[];
  onEdit: (t: LocalTask) => void;
  onStatusChange: (id: string, s: TaskStatus) => void;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {KANBAN_COLS.map(({ status, label }) => {
        const col = tasks.filter((t) => t.status === status);
        return (
          <div key={status} className="bg-background-surface border border-border-default rounded-card overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border-default">
              <div className="flex items-center gap-2">
                <StatusBadge status={status} />
              </div>
              <span className="text-text-muted text-xs font-mono">{col.length}</span>
            </div>
            <div className="p-3 space-y-2 min-h-[120px]">
              {col.map((t) => {
                const overdue = isOverdue(t.due_date, t.status);
                return (
                  <div key={t.id}
                    className="bg-background-elevated border border-border-default rounded-input p-3 hover:border-border-hover transition-colors cursor-pointer"
                    onClick={() => onEdit(t)}>
                    <p className="text-text-primary text-sm leading-snug mb-2">{t.title}</p>
                    <div className="flex items-center justify-between gap-2">
                      <PriorityBadge priority={t.priority} />
                      <div className="flex items-center gap-2 text-xs text-text-muted">
                        {t.assignee && <span>{t.assignee}</span>}
                        {t.due_date && (
                          <span className={cn(overdue && "text-accent-red")}>
                            {fmtDate(t.due_date)}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-1 mt-2">
                      {KANBAN_COLS.filter((c) => c.status !== status).map((c) => (
                        <button key={c.status}
                          onClick={(e) => { e.stopPropagation(); onStatusChange(t.id, c.status); }}
                          className="text-[10px] font-mono text-text-muted hover:text-accent-blue transition-colors px-1.5 py-0.5 rounded border border-border-default hover:border-accent-blue/30">
                          → {c.label}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Action Modal ─────────────────────────────────────────────────────────────

function ActionModal({ task, team, onSave, onClose }: {
  task: LocalTask | null;
  team: TeamMember[];
  onSave: (data: Omit<LocalTask, "id" | "created_at">) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState<Omit<LocalTask, "id" | "created_at">>(
    task ? { title: task.title, description: task.description ?? "", assignee: task.assignee ?? "",
      status: task.status, priority: task.priority, start_date: task.start_date ?? "",
      due_date: task.due_date ?? "", completed_at: task.completed_at ?? "" }
      : emptyForm()
  );

  const f = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((p) => ({ ...p, [k]: e.target.value }));

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) return;
    onSave({
      ...form,
      start_date: form.start_date || undefined,
      due_date: form.due_date || undefined,
      completed_at: form.completed_at || undefined,
      description: form.description || undefined,
      assignee: form.assignee || undefined,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-background-elevated border border-border-default rounded-card w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-5 border-b border-border-default">
          <h2 className="font-semibold text-text-primary">{task ? "Edit action" : "New action"}</h2>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary transition-colors"><X size={16} /></button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <Field label="Title" required>
            <input autoFocus value={form.title} onChange={f("title")} placeholder="e.g. Draft Q3 launch plan"
              className={inputCls} required />
          </Field>

          <Field label="Description">
            <textarea value={form.description} onChange={f("description")}
              placeholder="Optional details, links, context…"
              rows={3} className={cn(inputCls, "resize-none")} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Assignee">
              <select value={form.assignee} onChange={f("assignee")} className={inputCls}>
                <option value="">— Unassigned —</option>
                {team.map((m) => <option key={m.id} value={m.name}>{m.name}</option>)}
              </select>
            </Field>
            <Field label="Priority">
              <select value={form.priority} onChange={f("priority")} className={inputCls}>
                {PRIORITY_OPTIONS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Field label="Start date">
              <input type="date" value={form.start_date} onChange={f("start_date")} className={inputCls} />
            </Field>
            <Field label="Due date">
              <input type="date" value={form.due_date} onChange={f("due_date")} className={inputCls} />
            </Field>
            <Field label="Completed">
              <input type="date" value={form.completed_at} onChange={f("completed_at")} className={inputCls} />
            </Field>
          </div>

          <Field label="Status">
            <select value={form.status} onChange={f("status")} className={inputCls}>
              {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </Field>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="px-4 py-2 rounded-input border border-border-default text-text-secondary hover:text-text-primary text-sm transition-colors">
              Cancel
            </button>
            <button type="submit"
              className="px-4 py-2 rounded-input bg-accent-blue text-white text-sm font-medium hover:bg-accent-blue/90 transition-colors flex items-center gap-2">
              <Check size={14} /> Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Team Modal ───────────────────────────────────────────────────────────────

function TeamModal({ team, newName, onNameChange, onAdd, onRemove, onClose }: {
  team: TeamMember[];
  newName: string;
  onNameChange: (v: string) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-background-elevated border border-border-default rounded-card w-full max-w-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-default">
          <h2 className="font-semibold text-text-primary">Team Members</h2>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary"><X size={16} /></button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div className="flex gap-2">
            <input value={newName} onChange={(e) => onNameChange(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onAdd()}
              placeholder="Member name…" className={cn(inputCls, "flex-1")} />
            <button onClick={onAdd} disabled={!newName.trim()}
              className="px-3 py-2 rounded-input bg-accent-blue text-white text-sm disabled:opacity-40 transition-colors">
              <Plus size={14} />
            </button>
          </div>
          {team.length === 0 ? (
            <p className="text-text-muted text-sm text-center py-4">No team members yet.</p>
          ) : (
            <ul className="space-y-1">
              {team.map((m) => (
                <li key={m.id} className="flex items-center justify-between px-3 py-2 rounded-input hover:bg-background-surface transition-colors">
                  <div className="flex items-center gap-2.5">
                    <div className="w-6 h-6 rounded-full bg-accent-violet/20 border border-accent-violet/30 flex items-center justify-center text-xs text-accent-violet font-medium">
                      {m.name[0].toUpperCase()}
                    </div>
                    <span className="text-text-primary text-sm">{m.name}</span>
                  </div>
                  <button onClick={() => onRemove(m.id)} className="text-text-muted hover:text-accent-red transition-colors">
                    <X size={13} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Shared UI ────────────────────────────────────────────────────────────────

function PriorityBadge({ priority }: { priority: TaskPriority }) {
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium", PRIORITY_STYLE[priority])}>
      {priority.charAt(0).toUpperCase() + priority.slice(1)}
    </span>
  );
}

function StatusBadge({ status }: { status: TaskStatus }) {
  const label: Record<TaskStatus, string> = { todo: "To Do", in_progress: "In Progress", done: "Done", cancelled: "Cancelled" };
  return (
    <span className={cn("inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium", STATUS_STYLE[status])}>
      {label[status]}
    </span>
  );
}

function FilterSelect({ value, onChange, options }: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="relative">
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="appearance-none bg-background-surface border border-border-default rounded-card px-3 py-2.5 pr-7 text-sm text-text-secondary hover:border-border-hover transition-colors outline-none cursor-pointer">
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
    </div>
  );
}

function Field({ label, children, required }: { label: string; children: React.ReactNode; required?: boolean }) {
  return (
    <div>
      <label className="block text-xs text-text-secondary mb-1.5">
        {label}{required && <span className="text-accent-red ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

function EmptyState({ hasFilters, onNew }: { hasFilters: boolean; onNew: () => void }) {
  return (
    <div className="py-16 text-center">
      <AlertCircle size={24} className="mx-auto text-text-muted mb-3 opacity-40" />
      <p className="text-text-muted text-sm">
        {hasFilters ? "No actions match your filters." : "No actions yet."}
      </p>
      {!hasFilters && (
        <button onClick={onNew} className="mt-3 text-accent-blue text-sm hover:underline">
          + Create your first action
        </button>
      )}
    </div>
  );
}

const btn = "flex items-center gap-1.5 px-3 py-2 rounded-input border border-border-default bg-background-surface text-text-secondary hover:text-text-primary hover:border-border-hover text-sm transition-colors";
const inputCls = "w-full bg-background-surface border border-border-default rounded-input px-3 py-2 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-accent-blue/50 transition-colors";
