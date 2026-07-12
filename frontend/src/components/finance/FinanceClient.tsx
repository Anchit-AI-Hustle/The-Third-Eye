"use client";

import { useMemo, useRef, useState, useEffect } from "react";
import {
  Utensils, ShoppingCart, Bus, ShoppingBag, Receipt, HeartPulse,
  Clapperboard, Plane, Wallet, Mic, Sparkles, Trash2, Plus, Loader2, Pencil,
} from "lucide-react";
import { useLocalExpenses, type Expense } from "@/hooks/useLocalExpenses";

const CATEGORIES = [
  "Food", "Groceries", "Transport", "Shopping", "Bills",
  "Health", "Entertainment", "Travel", "Other",
] as const;
type Category = (typeof CATEGORIES)[number];

const META: Record<Category, { color: string; icon: typeof Utensils }> = {
  Food:          { color: "#FB923C", icon: Utensils },
  Groceries:     { color: "#34D399", icon: ShoppingCart },
  Transport:     { color: "#4F8EF7", icon: Bus },
  Shopping:      { color: "#F05B8D", icon: ShoppingBag },
  Bills:         { color: "#F0C94E", icon: Receipt },
  Health:        { color: "#22D3EE", icon: HeartPulse },
  Entertainment: { color: "#A78BFA", icon: Clapperboard },
  Travel:        { color: "#60A5FA", icon: Plane },
  Other:         { color: "#7878A8", icon: Wallet },
};

const inr = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
const money = (n: number) => `₹${inr.format(Math.round(n))}`;
const todayISO = () => new Date().toISOString().slice(0, 10);

export function FinanceClient() {
  const { expenses, ready, add, update, remove } = useLocalExpenses();

  // form state
  const [nl, setNl] = useState("");
  const [parsing, setParsing] = useState(false);
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<Category>("Food");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(todayISO());
  const [listening, setListening] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const recRef = useRef<any>(null);

  function startEdit(e: Expense) {
    setEditingId(e.id);
    setAmount(String(e.amount));
    setCategory((CATEGORIES as readonly string[]).includes(e.category) ? (e.category as Category) : "Other");
    setNote(e.note ?? "");
    setDate(e.spent_on);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function resetForm() {
    setEditingId(null); setNl(""); setAmount(""); setNote(""); setDate(todayISO());
  }

  const month = todayISO().slice(0, 7);
  const stats = useMemo(() => {
    const thisMonth = expenses.filter((e) => e.spent_on.startsWith(month));
    const total = thisMonth.reduce((s, e) => s + e.amount, 0);
    const today = expenses.filter((e) => e.spent_on === todayISO()).reduce((s, e) => s + e.amount, 0);
    const byCat = new Map<string, number>();
    for (const e of thisMonth) byCat.set(e.category, (byCat.get(e.category) ?? 0) + e.amount);
    const cats = [...byCat.entries()].sort((a, b) => b[1] - a[1]);
    const dayOfMonth = new Date().getDate();
    return { total, today, count: thisMonth.length, avg: total / Math.max(1, dayOfMonth), cats };
  }, [expenses, month]);

  async function parseNL() {
    const text = nl.trim();
    if (!text) return;
    setParsing(true);
    try {
      const res = await fetch("/api/finance/parse", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (res.ok) {
        const p = await res.json();
        if (p.amount) setAmount(String(p.amount));
        if (CATEGORIES.includes(p.category)) setCategory(p.category);
        if (p.note) setNote(p.note);
        if (p.spent_on) setDate(p.spent_on);
      }
    } catch { /* leave fields as-is */ }
    setParsing(false);
  }

  function startVoice() {
    const SR = (typeof window !== "undefined") && ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
    if (!SR) return;
    const rec = new SR();
    recRef.current = rec;
    rec.lang = "en-IN"; rec.interimResults = false; rec.maxAlternatives = 1;
    rec.onresult = (e: any) => { setNl(e.results[0][0].transcript); };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    setListening(true);
    rec.start();
  }

  useEffect(() => () => { try { recRef.current?.stop(); } catch { /* noop */ } }, []);

  async function submit() {
    const amt = Number(amount);
    if (!amt || amt <= 0) return;
    if (editingId) {
      await update(editingId, { amount: amt, category, note: note.trim() || undefined, spent_on: date });
    } else {
      await add({ amount: amt, category, note, spent_on: date });
    }
    resetForm();
  }

  const maxCat = stats.cats[0]?.[1] ?? 0;

  return (
    <div className="space-y-6">
      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="This month" value={money(stats.total)} accent />
        <Kpi label="Today" value={money(stats.today)} />
        <Kpi label="Transactions" value={String(stats.count)} />
        <Kpi label="Avg / day" value={money(stats.avg)} />
      </div>

      {/* Add expense */}
      <div className="rounded-card border border-border-default bg-background-surface/40 p-4 sm:p-5 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Sparkles size={14} className="text-[#4FC3F7]" />
            <span className="hud-label text-[#4FC3F7]">{editingId ? "Edit expense" : "Quick add"}</span>
          </div>
          {editingId && (
            <button onClick={resetForm} className="text-xs text-text-muted hover:text-text-primary font-mono">Cancel</button>
          )}
        </div>

        {/* Natural language */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              value={nl}
              onChange={(e) => setNl(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") parseNL(); }}
              placeholder='Type it plainly — e.g. "250 coffee" or "1200 groceries yesterday"'
              className="w-full bg-background-base border border-border-default rounded-input pl-3 pr-10 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-[#4FC3F7]/50"
            />
            <button
              onClick={startVoice}
              title="Speak"
              className={`absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 rounded ${listening ? "text-rose-400 animate-pulse" : "text-text-muted hover:text-[#4FC3F7]"}`}
            >
              <Mic size={15} />
            </button>
          </div>
          <button
            onClick={parseNL}
            disabled={parsing || !nl.trim()}
            className="px-3 py-2.5 rounded-input border border-[#4FC3F7]/40 bg-[#4FC3F7]/10 text-[#4FC3F7] text-xs font-mono uppercase tracking-wider hover:bg-[#4FC3F7]/20 disabled:opacity-40 flex items-center gap-1.5"
          >
            {parsing ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />} Parse
          </button>
        </div>

        {/* Structured fields (prefilled by parse, or fill directly) */}
        <div className="grid grid-cols-1 sm:grid-cols-[130px_1fr_150px] gap-3">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted text-sm">₹</span>
            <input
              value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
              inputMode="decimal" placeholder="0"
              className="w-full bg-background-base border border-border-default rounded-input pl-7 pr-3 py-2.5 text-sm text-text-primary focus:outline-none focus:border-[#4FC3F7]/50"
            />
          </div>
          <input
            value={note} onChange={(e) => setNote(e.target.value)}
            placeholder="Note (optional)"
            className="w-full bg-background-base border border-border-default rounded-input px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-[#4FC3F7]/50"
          />
          <input
            type="date" value={date} onChange={(e) => setDate(e.target.value)}
            className="w-full bg-background-base border border-border-default rounded-input px-3 py-2.5 text-sm text-text-primary focus:outline-none focus:border-[#4FC3F7]/50"
          />
        </div>

        {/* Category chips */}
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((c) => {
            const M = META[c]; const Icon = M.icon; const on = category === c;
            return (
              <button key={c} onClick={() => setCategory(c)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border text-xs transition-colors"
                style={on
                  ? { borderColor: M.color, background: `${M.color}22`, color: M.color }
                  : { borderColor: "var(--border-default, #1E1E38)", color: "#7878A8" }}
              >
                <Icon size={12} /> {c}
              </button>
            );
          })}
        </div>

        <button
          onClick={submit}
          disabled={!Number(amount)}
          className="w-full sm:w-auto px-5 py-2.5 rounded-input bg-[#4FC3F7] text-[#07070F] text-sm font-semibold hover:brightness-110 disabled:opacity-40 flex items-center justify-center gap-2"
        >
          <Plus size={15} /> {editingId ? "Save changes" : "Add expense"}
        </button>
      </div>

      {/* Category breakdown */}
      <div className="rounded-card border border-border-default bg-background-surface/40 p-4 sm:p-5">
        <div className="hud-label text-text-muted mb-3">This month by category</div>
        {stats.cats.length === 0 ? (
          <p className="text-sm text-text-muted py-4 text-center">No expenses yet this month. Add your first above.</p>
        ) : (
          <div className="space-y-2.5">
            {stats.cats.map(([cat, amt]) => {
              const M = META[cat as Category] ?? META.Other;
              const pct = stats.total ? (amt / stats.total) * 100 : 0;
              return (
                <div key={cat} className="flex items-center gap-3">
                  <span className="w-24 flex items-center gap-1.5 text-xs text-text-secondary flex-none">
                    <span className="w-2 h-2 rounded-full flex-none" style={{ background: M.color }} /> {cat}
                  </span>
                  <div className="flex-1 h-2 rounded-full bg-background-base overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${maxCat ? (amt / maxCat) * 100 : 0}%`, background: M.color }} />
                  </div>
                  <span className="w-24 text-right text-xs text-text-primary flex-none tabular-nums">
                    {money(amt)} <span className="text-text-muted">· {pct.toFixed(0)}%</span>
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Recent transactions */}
      <div className="rounded-card border border-border-default bg-background-surface/40 p-4 sm:p-5">
        <div className="hud-label text-text-muted mb-3">Recent</div>
        {!ready ? (
          <p className="text-sm text-text-muted py-4 text-center flex items-center justify-center gap-2"><Loader2 size={14} className="animate-spin" /> Loading…</p>
        ) : expenses.length === 0 ? (
          <p className="text-sm text-text-muted py-4 text-center">Nothing logged yet.</p>
        ) : (
          <div className="divide-y divide-border-default">
            {expenses.slice(0, 40).map((e) => <Row key={e.id} e={e} editing={editingId === e.id} onEdit={() => startEdit(e)} onDelete={() => remove(e.id)} />)}
          </div>
        )}
      </div>
    </div>
  );
}

function Kpi({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-card border border-border-default bg-background-surface/40 px-4 py-3">
      <div className="hud-label text-text-muted">{label}</div>
      <div className={`text-xl font-semibold mt-1 tabular-nums ${accent ? "text-[#4FC3F7]" : "text-text-primary"}`}>{value}</div>
    </div>
  );
}

function Row({ e, editing, onEdit, onDelete }: { e: Expense; editing?: boolean; onEdit: () => void; onDelete: () => void }) {
  const M = META[e.category as Category] ?? META.Other;
  const Icon = M.icon;
  return (
    <div className={`flex items-center gap-3 py-2.5 ${editing ? "bg-[#4FC3F7]/5 -mx-2 px-2 rounded" : ""}`}>
      <span className="w-8 h-8 rounded-lg flex items-center justify-center flex-none" style={{ background: `${M.color}1A`, color: M.color }}>
        <Icon size={15} />
      </span>
      <button onClick={onEdit} className="flex-1 min-w-0 text-left" title="Edit">
        <div className="text-sm text-text-primary truncate">{e.note || e.category}</div>
        <div className="text-[11px] text-text-muted font-mono">{e.category} · {e.spent_on}</div>
      </button>
      <span className="text-sm text-text-primary tabular-nums flex-none">{money(e.amount)}</span>
      <button onClick={onEdit} title="Edit" className="text-text-muted hover:text-[#4FC3F7] p-1 flex-none">
        <Pencil size={13} />
      </button>
      <button onClick={onDelete} title="Delete" className="text-text-muted hover:text-rose-400 p-1 flex-none">
        <Trash2 size={14} />
      </button>
    </div>
  );
}
