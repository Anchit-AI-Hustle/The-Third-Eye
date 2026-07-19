"use client";

import { useMemo, useState } from "react";
import {
  Target, Map, Layers, Plus, Trash2, Edit2, X, Check, TrendingUp, TrendingDown,
  Download, Lock, Crown, Building2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTeamOS } from "@/lib/teamos/store";
import {
  HORIZONS, PROJECT_STATUS, VERTICAL_COLORS, objectiveProgress, goalProgress,
  type Goal, type Horizon, type KeyResult, type Metric, type Objective, type Project, type ProjectStatus,
} from "@/lib/teamos/types";
import { useBilling } from "@/lib/billing/useBilling";
import { TIER_ORDER, type Tier } from "@/lib/billing/plans";
import { Paywall } from "@/components/billing/Paywall";

// The Enterprise-mode Team OS. Gated: the module needs Pro (core team tracking);
// OKRs + the long-range roadmap (3y/5y/10y) need Max (full depth). PIN unlock
// promotes to Max, so testers see everything.

type Tab = "roadmap" | "okr" | "projects";

function tierAtLeast(tier: Tier, min: Tier): boolean {
  return TIER_ORDER.indexOf(tier) >= TIER_ORDER.indexOf(min);
}

const card = "rounded-card border border-border-default bg-background-surface";
const input = "w-full bg-background-surface border border-border-default rounded-input px-3 py-2 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-accent-blue/50 transition-colors";
const chip = "flex items-center gap-1.5 px-3 py-2 rounded-input border border-border-default bg-background-surface text-text-secondary hover:text-text-primary hover:border-border-hover text-sm transition-colors";

export function TeamOS() {
  const { ready, state, addVertical, removeVertical, upsertProject, removeProject,
    upsertObjective, removeObjective, upsertGoal, removeGoal } = useTeamOS();
  const { tier } = useBilling();
  const [tab, setTab] = useState<Tab>("projects");
  const [paywall, setPaywall] = useState<{ open: boolean; required: Tier }>({ open: false, required: "pro" });

  const hasPro = tierAtLeast(tier, "pro");
  const hasMax = tierAtLeast(tier, "max");

  const summary = useMemo(() => {
    const active = state.projects.filter((p) => p.status === "active").length;
    const okrAvg = state.objectives.length
      ? Math.round(state.objectives.reduce((a, o) => a + objectiveProgress(o), 0) / state.objectives.length)
      : 0;
    return { active, okrAvg, verticals: state.verticals.length, objectives: state.objectives.length, goals: state.goals.length };
  }, [state]);

  function exportJSON() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = `teamos-${new Date().toISOString().slice(0, 10)}.json`;
    a.click(); URL.revokeObjectURL(url);
  }

  if (!ready) return <div className="py-10 flex justify-center"><div className="w-5 h-5 border-2 border-accent-violet/20 border-t-accent-violet rounded-full animate-spin" /></div>;

  // ── Locked (Basic / Plus) ──
  if (!hasPro) {
    return (
      <>
        <div className={cn(card, "p-8 text-center")}>
          <div className="w-12 h-12 mx-auto rounded-full bg-accent-violet/10 border border-accent-violet/40 flex items-center justify-center mb-3">
            <Lock size={20} className="text-accent-violet" />
          </div>
          <h3 className="font-display text-lg font-semibold text-text-primary">Team OS is a Pro feature</h3>
          <p className="text-text-muted text-sm mt-1 max-w-md mx-auto">
            Universal project trackers, live metrics, OKRs and a quarterly→10-year roadmap for the whole business.
            Team mode unlocks on Pro; full OKR + long-range depth on Max.
          </p>
          <button onClick={() => setPaywall({ open: true, required: "pro" })}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2.5 rounded-input bg-accent-violet text-white text-sm font-medium hover:opacity-90 transition-opacity">
            <Crown size={15} /> Unlock Team OS
          </button>
        </div>
        <Paywall open={paywall.open} onClose={() => setPaywall((p) => ({ ...p, open: false }))}
          reason="upgrade" requiredTier={paywall.required} feature="Team OS" />
      </>
    );
  }

  const TABS: { id: Tab; label: string; icon: typeof Target }[] = [
    { id: "projects", label: "Verticals & Projects", icon: Layers },
    { id: "okr", label: "Objectives (OKRs)", icon: Target },
    { id: "roadmap", label: "Roadmap", icon: Map },
  ];

  return (
    <div className="space-y-4">
      {/* Summary strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Verticals" value={summary.verticals} />
        <Stat label="Active projects" value={summary.active} accent="#4FC3F7" />
        <Stat label="Objectives" value={summary.objectives} accent="#A78BFA" />
        <Stat label="Avg OKR attainment" value={`${summary.okrAvg}%`} accent="#34D399" />
      </div>

      {/* Tabs + export */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex rounded-card border border-border-default overflow-hidden">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setTab(id)}
              className={cn("px-3.5 py-2 text-xs flex items-center gap-1.5 transition-colors border-l border-border-default first:border-l-0",
                tab === id ? "bg-accent-violet text-white" : "bg-background-surface text-text-secondary hover:text-text-primary")}>
              <Icon size={13} /> {label}
            </button>
          ))}
        </div>
        <button onClick={exportJSON} className={chip}><Download size={13} /> Export</button>
      </div>

      {tab === "projects" && (
        <ProjectsPanel state={state} addVertical={addVertical} removeVertical={removeVertical}
          upsertProject={upsertProject} removeProject={removeProject} />
      )}
      {tab === "okr" && (
        <OkrPanel objectives={state.objectives} upsert={upsertObjective} remove={removeObjective}
          hasMax={hasMax} onUpsell={() => setPaywall({ open: true, required: "max" })} />
      )}
      {tab === "roadmap" && (
        <RoadmapPanel goals={state.goals} upsert={upsertGoal} remove={removeGoal}
          hasMax={hasMax} onUpsell={() => setPaywall({ open: true, required: "max" })} />
      )}

      <Paywall open={paywall.open} onClose={() => setPaywall((p) => ({ ...p, open: false }))}
        reason="upgrade" requiredTier={paywall.required} feature="Full Team OS depth" />
    </div>
  );
}

function Stat({ label, value, accent = "#8891A8" }: { label: string; value: string | number; accent?: string }) {
  return (
    <div className={cn(card, "px-4 py-3")}>
      <div className="font-display text-2xl font-semibold text-text-primary" style={{ color: accent }}>{value}</div>
      <div className="text-[11px] font-mono text-text-muted mt-0.5">{label}</div>
    </div>
  );
}

function Bar({ pct, color = "#4FC3F7" }: { pct: number; color?: string }) {
  return (
    <span className="block w-full h-1.5 rounded-full bg-background-elevated overflow-hidden">
      <span className="block h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, pct))}%`, backgroundColor: color }} />
    </span>
  );
}

// ─── Verticals & Projects ─────────────────────────────────────────────────────

function ProjectsPanel({ state, addVertical, removeVertical, upsertProject, removeProject }: {
  state: ReturnType<typeof useTeamOS>["state"];
  addVertical: (name: string) => void;
  removeVertical: (id: string) => void;
  upsertProject: ReturnType<typeof useTeamOS>["upsertProject"];
  removeProject: (id: string) => void;
}) {
  const [newVert, setNewVert] = useState("");
  const [editing, setEditing] = useState<Project | null>(null);
  const [addingTo, setAddingTo] = useState<string | null>(null);

  if (state.verticals.length === 0) {
    return (
      <div className={cn(card, "p-6")}>
        <p className="text-text-secondary text-sm mb-3">Create a business vertical to start tracking its projects and metrics (e.g. Marketing, Ops, Product, Sales).</p>
        <div className="flex gap-2 max-w-sm">
          <input value={newVert} onChange={(e) => setNewVert(e.target.value)} onKeyDown={(e) => e.key === "Enter" && newVert.trim() && (addVertical(newVert), setNewVert(""))}
            placeholder="Vertical name…" className={input} />
          <button onClick={() => { if (newVert.trim()) { addVertical(newVert); setNewVert(""); } }}
            className="px-3 py-2 rounded-input bg-accent-violet text-white text-sm"><Plus size={14} /></button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2 max-w-sm">
        <input value={newVert} onChange={(e) => setNewVert(e.target.value)} onKeyDown={(e) => e.key === "Enter" && newVert.trim() && (addVertical(newVert), setNewVert(""))}
          placeholder="Add vertical…" className={input} />
        <button onClick={() => { if (newVert.trim()) { addVertical(newVert); setNewVert(""); } }}
          className="px-3 py-2 rounded-input bg-accent-violet text-white text-sm"><Plus size={14} /></button>
      </div>

      {state.verticals.map((v) => {
        const projects = state.projects.filter((p) => p.verticalId === v.id);
        return (
          <div key={v.id} className={cn(card, "overflow-hidden")}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-border-default" style={{ borderLeft: `3px solid ${v.color}` }}>
              <div className="flex items-center gap-2">
                <Building2 size={15} style={{ color: v.color }} />
                <span className="font-semibold text-text-primary text-sm">{v.name}</span>
                <span className="text-[11px] font-mono text-text-muted">{projects.length} projects</span>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setAddingTo(v.id)} className="text-xs text-accent-violet hover:underline flex items-center gap-1"><Plus size={12} /> Project</button>
                <button onClick={() => removeVertical(v.id)} className="text-text-muted hover:text-accent-red" title="Remove vertical"><Trash2 size={13} /></button>
              </div>
            </div>
            <div className="divide-y divide-border-default">
              {projects.length === 0 && <p className="px-4 py-4 text-text-muted text-sm">No projects yet.</p>}
              {projects.map((p) => {
                const st = PROJECT_STATUS.find((s) => s.id === p.status)!;
                return (
                  <div key={p.id} className="px-4 py-3 hover:bg-background-elevated/40 transition-colors group">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-text-primary text-sm font-medium">{p.name}</span>
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-mono" style={{ color: st.color, backgroundColor: `${st.color}1A`, border: `1px solid ${st.color}55` }}>{st.label}</span>
                          {p.owner && <span className="text-[11px] text-text-muted font-mono">@{p.owner}</span>}
                          {p.due && <span className="text-[11px] text-text-muted font-mono">due {p.due}</span>}
                        </div>
                        {p.reason && <p className="text-text-muted text-xs mt-1">{p.reason}</p>}
                        <div className="mt-2 flex items-center gap-2">
                          <Bar pct={p.progress} color={v.color} />
                          <span className="text-[11px] font-mono text-text-muted w-9 text-right">{p.progress}%</span>
                        </div>
                        {p.metrics.length > 0 && (
                          <div className="flex flex-wrap gap-3 mt-2">
                            {p.metrics.map((m) => (
                              <span key={m.id} className="text-[11px] font-mono text-text-secondary flex items-center gap-1">
                                <span className="text-text-muted">{m.label}:</span> {m.value.toLocaleString()}{m.unit ?? ""}
                                {m.trend !== undefined && m.trend !== 0 && (
                                  <span className={m.trend > 0 ? "text-success flex items-center" : "text-accent-red flex items-center"}>
                                    {m.trend > 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}{Math.abs(m.trend)}%
                                  </span>
                                )}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => setEditing(p)} className="text-text-muted hover:text-accent-blue"><Edit2 size={13} /></button>
                        <button onClick={() => removeProject(p.id)} className="text-text-muted hover:text-accent-red"><Trash2 size={13} /></button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {(editing || addingTo) && (
        <ProjectModal
          project={editing}
          verticalId={addingTo ?? editing!.verticalId}
          onSave={(data) => { upsertProject(data); setEditing(null); setAddingTo(null); }}
          onClose={() => { setEditing(null); setAddingTo(null); }}
        />
      )}
    </div>
  );
}

function ProjectModal({ project, verticalId, onSave, onClose }: {
  project: Project | null;
  verticalId: string;
  onSave: (p: Omit<Project, "id" | "updatedAt"> & { id?: string }) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(project?.name ?? "");
  const [status, setStatus] = useState<ProjectStatus>(project?.status ?? "planned");
  const [progress, setProgress] = useState(project?.progress ?? 0);
  const [owner, setOwner] = useState(project?.owner ?? "");
  const [due, setDue] = useState(project?.due ?? "");
  const [reason, setReason] = useState(project?.reason ?? "");
  const [metrics, setMetrics] = useState<Metric[]>(project?.metrics ?? []);

  const addMetric = () => setMetrics((m) => [...m, { id: `m_${Date.now()}_${m.length}`, label: "", value: 0 }]);
  const setMetric = (i: number, patch: Partial<Metric>) => setMetrics((m) => m.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  const delMetric = (i: number) => setMetrics((m) => m.filter((_, idx) => idx !== i));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    onSave({
      id: project?.id, name: name.trim(), verticalId, status, progress: Math.max(0, Math.min(100, progress)),
      owner: owner || undefined, due: due || undefined, reason: reason || undefined,
      metrics: metrics.filter((m) => m.label.trim()),
    });
  }

  return (
    <Modal title={project ? "Edit project" : "New project"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Project name" required><input autoFocus value={name} onChange={(e) => setName(e.target.value)} className={input} placeholder="e.g. Q3 performance-marketing scale-up" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Status">
            <select value={status} onChange={(e) => setStatus(e.target.value as ProjectStatus)} className={input}>
              {PROJECT_STATUS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </Field>
          <Field label={`Progress — ${progress}%`}>
            <input type="range" min={0} max={100} value={progress} onChange={(e) => setProgress(+e.target.value)} className="w-full accent-accent-violet" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Owner"><input value={owner} onChange={(e) => setOwner(e.target.value)} className={input} placeholder="Name" /></Field>
          <Field label="Due"><input type="date" value={due} onChange={(e) => setDue(e.target.value)} className={input} /></Field>
        </div>
        <Field label="Reason / expected impact"><textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} className={cn(input, "resize-none")} placeholder="Why this matters — the outcome it drives" /></Field>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs text-text-secondary">Metrics</label>
            <button type="button" onClick={addMetric} className="text-xs text-accent-violet hover:underline flex items-center gap-1"><Plus size={12} /> Add metric</button>
          </div>
          <div className="space-y-2">
            {metrics.map((m, i) => (
              <div key={m.id} className="flex gap-2 items-center">
                <input value={m.label} onChange={(e) => setMetric(i, { label: e.target.value })} placeholder="Metric" className={cn(input, "flex-1")} />
                <input type="number" value={m.value} onChange={(e) => setMetric(i, { value: +e.target.value })} placeholder="Value" className={cn(input, "w-24")} />
                <input value={m.unit ?? ""} onChange={(e) => setMetric(i, { unit: e.target.value })} placeholder="unit" className={cn(input, "w-16")} />
                <input type="number" value={m.trend ?? ""} onChange={(e) => setMetric(i, { trend: e.target.value === "" ? undefined : +e.target.value })} placeholder="%±" className={cn(input, "w-16")} title="Trend % vs last reading" />
                <button type="button" onClick={() => delMetric(i)} className="text-text-muted hover:text-accent-red"><X size={14} /></button>
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-1">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-input border border-border-default text-text-secondary text-sm">Cancel</button>
          <button type="submit" className="px-4 py-2 rounded-input bg-accent-violet text-white text-sm font-medium flex items-center gap-2"><Check size={14} /> Save</button>
        </div>
      </form>
    </Modal>
  );
}

// ─── OKRs ─────────────────────────────────────────────────────────────────────

function OkrPanel({ objectives, upsert, remove, hasMax, onUpsell }: {
  objectives: Objective[];
  upsert: (o: Omit<Objective, "id"> & { id?: string }) => void;
  remove: (id: string) => void;
  hasMax: boolean;
  onUpsell: () => void;
}) {
  const [editing, setEditing] = useState<Objective | null>(null);
  const [adding, setAdding] = useState(false);

  if (!hasMax) {
    return (
      <div className={cn(card, "p-6 text-center")}>
        <Crown size={20} className="mx-auto text-accent-violet mb-2" />
        <p className="text-text-primary text-sm font-medium">OKRs are part of full Team depth (Max)</p>
        <p className="text-text-muted text-xs mt-1 max-w-md mx-auto">Pro covers project + metric tracking. Objectives & Key Results unlock on Max.</p>
        <button onClick={onUpsell} className="mt-3 px-4 py-2 rounded-input bg-accent-violet text-white text-sm">Upgrade to Max</button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <button onClick={() => setAdding(true)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-input bg-accent-violet text-white text-sm"><Plus size={14} /> New objective</button>
      {objectives.length === 0 && <p className={cn(card, "p-6 text-text-muted text-sm")}>No objectives yet. Add one to set Key Results and track attainment.</p>}
      {objectives.map((o) => {
        const pct = objectiveProgress(o);
        return (
          <div key={o.id} className={cn(card, "p-4")}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-text-primary text-sm font-medium">{o.title}</span>
                  <span className="text-[11px] font-mono text-text-muted">{o.period}</span>
                  {o.owner && <span className="text-[11px] font-mono text-text-muted">@{o.owner}</span>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-mono text-accent-violet">{pct}%</span>
                <button onClick={() => setEditing(o)} className="text-text-muted hover:text-accent-blue"><Edit2 size={13} /></button>
                <button onClick={() => remove(o.id)} className="text-text-muted hover:text-accent-red"><Trash2 size={13} /></button>
              </div>
            </div>
            <div className="mt-2"><Bar pct={pct} color="#A78BFA" /></div>
            <div className="mt-3 space-y-1.5">
              {o.keyResults.map((kr) => {
                const krPct = kr.target > 0 ? Math.round(Math.min(1, kr.current / kr.target) * 100) : 0;
                return (
                  <div key={kr.id} className="flex items-center gap-3 text-xs">
                    <span className="text-text-secondary flex-1 min-w-0 truncate">{kr.title}</span>
                    <span className="font-mono text-text-muted">{kr.current.toLocaleString()}/{kr.target.toLocaleString()}{kr.unit ?? ""}</span>
                    <span className="w-16"><Bar pct={krPct} color="#A78BFA" /></span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
      {(editing || adding) && (
        <ObjectiveModal objective={editing} onSave={(o) => { upsert(o); setEditing(null); setAdding(false); }} onClose={() => { setEditing(null); setAdding(false); }} />
      )}
    </div>
  );
}

function ObjectiveModal({ objective, onSave, onClose }: {
  objective: Objective | null;
  onSave: (o: Omit<Objective, "id"> & { id?: string }) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(objective?.title ?? "");
  const [period, setPeriod] = useState(objective?.period ?? "");
  const [owner, setOwner] = useState(objective?.owner ?? "");
  const [krs, setKrs] = useState<KeyResult[]>(objective?.keyResults ?? []);

  const addKr = () => setKrs((k) => [...k, { id: `kr_${Date.now()}_${k.length}`, title: "", target: 100, current: 0 }]);
  const setKr = (i: number, patch: Partial<KeyResult>) => setKrs((k) => k.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  const delKr = (i: number) => setKrs((k) => k.filter((_, idx) => idx !== i));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    onSave({ id: objective?.id, title: title.trim(), period: period.trim() || "This quarter", owner: owner || undefined, keyResults: krs.filter((k) => k.title.trim()) });
  }

  return (
    <Modal title={objective ? "Edit objective" : "New objective"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Objective" required><input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} className={input} placeholder="e.g. Become the #1 D2C wellness-tea brand in the metros" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Period"><input value={period} onChange={(e) => setPeriod(e.target.value)} className={input} placeholder="Q3 2026" /></Field>
          <Field label="Owner"><input value={owner} onChange={(e) => setOwner(e.target.value)} className={input} placeholder="Name" /></Field>
        </div>
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs text-text-secondary">Key Results</label>
            <button type="button" onClick={addKr} className="text-xs text-accent-violet hover:underline flex items-center gap-1"><Plus size={12} /> Add KR</button>
          </div>
          <div className="space-y-2">
            {krs.map((kr, i) => (
              <div key={kr.id} className="flex gap-2 items-center">
                <input value={kr.title} onChange={(e) => setKr(i, { title: e.target.value })} placeholder="Key result" className={cn(input, "flex-1")} />
                <input type="number" value={kr.current} onChange={(e) => setKr(i, { current: +e.target.value })} placeholder="now" className={cn(input, "w-20")} />
                <span className="text-text-muted text-xs">/</span>
                <input type="number" value={kr.target} onChange={(e) => setKr(i, { target: +e.target.value })} placeholder="target" className={cn(input, "w-20")} />
                <input value={kr.unit ?? ""} onChange={(e) => setKr(i, { unit: e.target.value })} placeholder="unit" className={cn(input, "w-14")} />
                <button type="button" onClick={() => delKr(i)} className="text-text-muted hover:text-accent-red"><X size={14} /></button>
              </div>
            ))}
          </div>
        </div>
        <div className="flex justify-end gap-3 pt-1">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-input border border-border-default text-text-secondary text-sm">Cancel</button>
          <button type="submit" className="px-4 py-2 rounded-input bg-accent-violet text-white text-sm font-medium flex items-center gap-2"><Check size={14} /> Save</button>
        </div>
      </form>
    </Modal>
  );
}

// ─── Roadmap (goals ladder) ────────────────────────────────────────────────────

function RoadmapPanel({ goals, upsert, remove, hasMax, onUpsell }: {
  goals: Goal[];
  upsert: (g: Omit<Goal, "id"> & { id?: string }) => void;
  remove: (id: string) => void;
  hasMax: boolean;
  onUpsell: () => void;
}) {
  const [editing, setEditing] = useState<Goal | null>(null);
  const [addingHorizon, setAddingHorizon] = useState<Horizon | null>(null);

  return (
    <div className="space-y-4">
      {HORIZONS.map((h) => {
        const locked = h.longRange && !hasMax; // 3y/5y/10y need Max
        const rows = goals.filter((g) => g.horizon === h.id);
        return (
          <div key={h.id} className={cn(card, "overflow-hidden")}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-border-default">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-text-primary text-sm">{h.label}</span>
                  {h.longRange && <span className="text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded-full text-accent-violet bg-accent-violet/10 border border-accent-violet/40">Max</span>}
                </div>
                <p className="text-[11px] text-text-muted">{h.blurb}</p>
              </div>
              {locked ? (
                <button onClick={onUpsell} className="text-xs text-accent-violet flex items-center gap-1"><Lock size={12} /> Unlock</button>
              ) : (
                <button onClick={() => setAddingHorizon(h.id)} className="text-xs text-accent-violet hover:underline flex items-center gap-1"><Plus size={12} /> Goal</button>
              )}
            </div>
            {locked ? (
              <p className="px-4 py-4 text-text-muted text-sm">Long-range planning (3y/5y/10y) is part of full Team depth on Max.</p>
            ) : rows.length === 0 ? (
              <p className="px-4 py-4 text-text-muted text-sm">No {h.label.toLowerCase()} goals yet.</p>
            ) : (
              <div className="divide-y divide-border-default">
                {rows.map((g) => {
                  const pct = goalProgress(g);
                  return (
                    <div key={g.id} className="px-4 py-3 group">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <span className="text-text-primary text-sm">{g.title}</span>
                          {g.metric && (
                            <div className="text-[11px] font-mono text-text-muted mt-0.5">
                              {g.metric}: {g.current?.toLocaleString() ?? "—"}{g.target !== undefined ? ` / ${g.target.toLocaleString()}` : ""}{g.unit ?? ""}
                            </div>
                          )}
                          {g.note && <p className="text-text-muted text-xs mt-0.5">{g.note}</p>}
                          {pct !== null && <div className="mt-2 max-w-xs"><Bar pct={pct} color="#34D399" /></div>}
                        </div>
                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          {pct !== null && <span className="text-[11px] font-mono text-success">{pct}%</span>}
                          <button onClick={() => setEditing(g)} className="text-text-muted hover:text-accent-blue"><Edit2 size={13} /></button>
                          <button onClick={() => remove(g.id)} className="text-text-muted hover:text-accent-red"><Trash2 size={13} /></button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
      {(editing || addingHorizon) && (
        <GoalModal goal={editing} horizon={addingHorizon ?? editing!.horizon}
          onSave={(g) => { upsert(g); setEditing(null); setAddingHorizon(null); }}
          onClose={() => { setEditing(null); setAddingHorizon(null); }} />
      )}
    </div>
  );
}

function GoalModal({ goal, horizon, onSave, onClose }: {
  goal: Goal | null;
  horizon: Horizon;
  onSave: (g: Omit<Goal, "id"> & { id?: string }) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(goal?.title ?? "");
  const [metric, setMetric] = useState(goal?.metric ?? "");
  const [target, setTarget] = useState<string>(goal?.target?.toString() ?? "");
  const [current, setCurrent] = useState<string>(goal?.current?.toString() ?? "");
  const [unit, setUnit] = useState(goal?.unit ?? "");
  const [note, setNote] = useState(goal?.note ?? "");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    onSave({
      id: goal?.id, title: title.trim(), horizon,
      metric: metric || undefined,
      target: target === "" ? undefined : +target,
      current: current === "" ? undefined : +current,
      unit: unit || undefined, note: note || undefined,
    });
  }
  const label = HORIZONS.find((h) => h.id === horizon)!.label;

  return (
    <Modal title={goal ? "Edit goal" : `New ${label} goal`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Goal" required><input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} className={input} placeholder="e.g. ₹500 Cr annual revenue run-rate" /></Field>
        <Field label="Metric (optional)"><input value={metric} onChange={(e) => setMetric(e.target.value)} className={input} placeholder="e.g. Revenue, NPS, Market share" /></Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Current"><input type="number" value={current} onChange={(e) => setCurrent(e.target.value)} className={input} /></Field>
          <Field label="Target"><input type="number" value={target} onChange={(e) => setTarget(e.target.value)} className={input} /></Field>
          <Field label="Unit"><input value={unit} onChange={(e) => setUnit(e.target.value)} className={input} placeholder="Cr, %, k" /></Field>
        </div>
        <Field label="Note"><textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className={cn(input, "resize-none")} placeholder="Context, assumptions, the strategy behind the number" /></Field>
        <div className="flex justify-end gap-3 pt-1">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-input border border-border-default text-text-secondary text-sm">Cancel</button>
          <button type="submit" className="px-4 py-2 rounded-input bg-accent-violet text-white text-sm font-medium flex items-center gap-2"><Check size={14} /> Save</button>
        </div>
      </form>
    </Modal>
  );
}

// ─── Shared ────────────────────────────────────────────────────────────────────

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-background-elevated border border-border-default rounded-card w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-default">
          <h2 className="font-semibold text-text-primary">{title}</h2>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary"><X size={16} /></button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children, required }: { label: string; children: React.ReactNode; required?: boolean }) {
  return (
    <div>
      <label className="block text-xs text-text-secondary mb-1.5">{label}{required && <span className="text-accent-red ml-0.5">*</span>}</label>
      {children}
    </div>
  );
}
