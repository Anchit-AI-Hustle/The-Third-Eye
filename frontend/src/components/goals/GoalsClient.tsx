"use client";

import { useState } from "react";
import { Target, Plus, Trash2, ChevronUp, ChevronDown, Check, X, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocalGoals, Goal } from "@/hooks/useLocalGoals";

const CATEGORIES = ["Career", "Health", "Finance", "Learning", "Personal", "Business"];

const emptyForm = (): Omit<Goal, "id" | "created_at"> => ({
  title: "", description: "", category: "Career", target: 100, current: 0, unit: "%", deadline: "",
});

export function GoalsClient() {
  const { goals, ready, add, adjust, remove } = useLocalGoals();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm());

  const f = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((p) => ({ ...p, [k]: k === "target" || k === "current" ? Number(e.target.value) : e.target.value }));

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) return;
    await add(form);
    setForm(emptyForm()); setShowForm(false);
  }

  function exportGoals() {
    const header = "Title,Category,Current,Target,Unit,Deadline,Description";
    const rows = goals.map((g) =>
      [g.title, g.category, g.current, g.target, g.unit, g.deadline ?? "", g.description ?? ""]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(",")
    );
    const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = `thirdeye-goals-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(a.href);
  }

  if (!ready) return <div className="flex justify-center py-20"><div className="w-4 h-4 border-2 border-accent-blue/20 border-t-accent-blue rounded-full animate-spin" /></div>;

  const byCategory = CATEGORIES.reduce<Record<string, Goal[]>>((acc, cat) => {
    const items = goals.filter((g) => g.category === cat);
    if (items.length > 0) acc[cat] = items;
    return acc;
  }, {});

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex justify-between items-center">
        <div className="flex gap-3">
          <Stat label="Total goals" value={goals.length} />
          <Stat label="Completed" value={goals.filter((g) => g.current >= g.target).length} color="green" />
          <Stat label="In progress" value={goals.filter((g) => g.current > 0 && g.current < g.target).length} color="blue" />
        </div>
        <div className="flex items-center gap-2">
          {goals.length > 0 && (
            <button onClick={exportGoals}
              className="flex items-center gap-1.5 px-3 py-2 rounded-input border border-border-default text-text-muted hover:text-[#4FC3F7] hover:border-[#4FC3F7]/30 text-sm transition-colors">
              <Download size={13} /> Export
            </button>
          )}
          <button onClick={() => setShowForm((v) => !v)}
            className="flex items-center gap-2 px-4 py-2 rounded-input bg-accent-blue text-white text-sm font-medium hover:bg-accent-blue/90 transition-colors">
            {showForm ? <X size={14} /> : <Plus size={14} />}
            {showForm ? "Cancel" : "New Goal"}
          </button>
        </div>
      </div>

      {showForm && (
        <form onSubmit={handleAdd} className="bg-background-surface border border-border-default rounded-card p-5 space-y-4 animate-slide-up">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-xs text-text-secondary mb-1.5">Goal title *</label>
              <input value={form.title} onChange={f("title")} placeholder="e.g. Read 24 books this year"
                required className={inputCls} autoFocus />
            </div>
            <div>
              <label className="block text-xs text-text-secondary mb-1.5">Category</label>
              <select value={form.category} onChange={f("category")} className={inputCls}>
                {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-text-secondary mb-1.5">Deadline</label>
              <input type="date" value={form.deadline} onChange={f("deadline")} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs text-text-secondary mb-1.5">Target value</label>
              <input type="number" min={1} value={form.target} onChange={f("target")} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs text-text-secondary mb-1.5">Unit</label>
              <input value={form.unit} onChange={f("unit")} placeholder="%, books, km, $…" className={inputCls} />
            </div>
            <div className="col-span-2">
              <label className="block text-xs text-text-secondary mb-1.5">Description (optional)</label>
              <input value={form.description} onChange={f("description")} placeholder="Why this goal matters…" className={inputCls} />
            </div>
          </div>
          <div className="flex justify-end">
            <button type="submit" className="flex items-center gap-2 px-4 py-2 rounded-input bg-accent-blue text-white text-sm font-medium hover:bg-accent-blue/90 transition-colors">
              <Check size={14} /> Create Goal
            </button>
          </div>
        </form>
      )}

      {goals.length === 0 ? (
        <div className="py-20 text-center">
          <Target size={28} className="mx-auto text-text-muted mb-4 opacity-40" />
          <p className="text-text-muted text-sm">No goals yet. Create your first one above.</p>
          <p className="text-text-muted text-xs mt-1">Your AI will help you track and achieve them.</p>
        </div>
      ) : (
        Object.entries(byCategory).map(([cat, items]) => (
          <div key={cat}>
            <p className="text-[10px] font-mono text-text-muted tracking-widest uppercase mb-3">{cat}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {items.map((g) => {
                const pct = Math.min(100, Math.round((g.current / g.target) * 100));
                const done = g.current >= g.target;
                return (
                  <div key={g.id} className={cn(
                    "bg-background-surface border rounded-card p-4 transition-colors",
                    done ? "border-success/30" : "border-border-default hover:border-border-hover"
                  )}>
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          {done && <Check size={12} className="text-success flex-none" />}
                          <p className="text-sm font-medium text-text-primary truncate">{g.title}</p>
                        </div>
                        {g.description && <p className="text-xs text-text-muted mt-0.5 truncate">{g.description}</p>}
                      </div>
                      <button onClick={() => remove(g.id)} className="text-text-muted hover:text-accent-red transition-colors flex-none">
                        <Trash2 size={12} />
                      </button>
                    </div>

                    <div className="h-1.5 bg-background-elevated rounded-full overflow-hidden mb-2">
                      <div
                        className={cn("h-full rounded-full transition-all duration-500", done ? "bg-success" : "bg-accent-blue")}
                        style={{ width: `${pct}%` }}
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <span className={cn("text-xs font-mono", done ? "text-success" : "text-text-secondary")}>
                        {g.current} / {g.target} {g.unit} · {pct}%
                      </span>
                      <div className="flex items-center gap-1">
                        {g.deadline && (
                          <span className="text-[10px] font-mono text-text-muted mr-2">
                            {new Date(g.deadline).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                          </span>
                        )}
                        <button onClick={() => adjust(g.id, -1)}
                          className="p-1 rounded text-text-muted hover:text-text-primary hover:bg-background-elevated transition-colors">
                          <ChevronDown size={13} />
                        </button>
                        <button onClick={() => adjust(g.id, 1)}
                          className="p-1 rounded text-text-muted hover:text-accent-blue hover:bg-accent-blue/10 transition-colors">
                          <ChevronUp size={13} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color?: string }) {
  const cls = color === "green" ? "text-success" : color === "blue" ? "text-accent-blue" : "text-text-primary";
  return (
    <div className="bg-background-surface border border-border-default rounded-card px-4 py-2 flex items-center gap-2">
      <span className={cn("font-display text-lg font-bold", cls)}>{value}</span>
      <span className="text-text-muted text-xs">{label}</span>
    </div>
  );
}

const inputCls = "w-full bg-background-elevated border border-border-default rounded-input px-3 py-2 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-accent-blue/50 transition-colors";
