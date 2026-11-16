"use client";

import { useMemo, useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import {
  ShieldCheck, Check, X, AlertTriangle, ChevronDown, Wrench, Target as TargetIcon,
} from "lucide-react";
import { AUDITS, type Severity } from "@/lib/audits";

/**
 * App Audit — an honest, self-critical review of every LHS page.
 *
 * Scores are on 0–10 across four dimensions (accuracy, implementation,
 * execution, results). "Current" is the state at audit time; "Target" is what
 * the page reaches once the listed fixes land. We do NOT fabricate a 9.5 — the
 * only honest way to a 9.5 is to fix the issues, so each issue tracks whether
 * it is already `fixed` or still `pending`.
 */

const SEV_STYLE: Record<Severity, string> = {
  critical: "bg-rose-500/15 text-rose-300 border-rose-500/30",
  high: "bg-orange-500/15 text-orange-300 border-orange-500/30",
  medium: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  low: "bg-slate-500/15 text-slate-300 border-slate-500/30",
};

function scoreColor(n: number) {
  if (n >= 8.5) return "text-emerald-400";
  if (n >= 7) return "text-[#4FC3F7]";
  if (n >= 5) return "text-amber-300";
  return "text-rose-400";
}

function Bar({ label, value }: { label: string; value: number }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[10px] uppercase tracking-wider text-text-muted">
        <span>{label}</span>
        <span className={scoreColor(value)}>{value.toFixed(1)}</span>
      </div>
      <div className="h-1.5 rounded-full bg-background-base overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-[#4FC3F7] to-emerald-400"
          style={{ width: `${(value / 10) * 100}%` }}
        />
      </div>
    </div>
  );
}

export default function AuditPage() {
  const [open, setOpen] = useState<string | null>("Task Tracker");

  const overall = useMemo(() => {
    const cur = AUDITS.reduce((a, x) => a + x.current, 0) / AUDITS.length;
    const tgt = AUDITS.reduce((a, x) => a + x.target, 0) / AUDITS.length;
    const issues = AUDITS.flatMap((a) => a.issues);
    return {
      cur,
      tgt,
      fixed: issues.filter((i) => i.status === "fixed").length,
      total: issues.length,
      critical: issues.filter((i) => i.severity === "critical" && i.status !== "fixed").length,
    };
  }, []);

  return (
    <MainLayout>
      <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-6">
        <header className="space-y-2">
          <div className="text-xs uppercase tracking-[0.2em] text-text-muted flex items-center gap-2">
            <ShieldCheck size={13} className="text-[#4FC3F7]" /> Overall App Audit
          </div>
          <h1 className="text-2xl sm:text-3xl font-semibold">App Audit</h1>
          <p className="text-sm text-text-muted max-w-2xl">
            An honest, self-critical review of every page - rated on accuracy, implementation,
            execution and results. The target for every page is 9.5. We don&apos;t fake the number:
            the path to 9.5 is the fix list below, and each item shows whether it&apos;s already done.
          </p>
        </header>

        {/* Overall */}
        <section className="rounded-2xl border border-border-default bg-background-surface/40 p-5 sm:p-6">
          <div className="flex flex-wrap items-end gap-6">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-text-muted">Current overall</div>
              <div className={`text-5xl font-semibold ${scoreColor(overall.cur)}`}>{overall.cur.toFixed(1)}</div>
            </div>
            <div className="text-text-muted text-2xl pb-2">→</div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-text-muted flex items-center gap-1">
                <TargetIcon size={11} /> Target after fixes
              </div>
              <div className="text-5xl font-semibold text-emerald-400">{overall.tgt.toFixed(1)}</div>
            </div>
            <div className="flex-1 min-w-[180px] grid grid-cols-3 gap-3 pb-1">
              <Stat label="Fixes done" value={`${overall.fixed}/${overall.total}`} />
              <Stat label="Critical open" value={`${overall.critical}`} danger={overall.critical > 0} />
              <Stat label="Pages" value={`${AUDITS.length}`} />
            </div>
          </div>
          <p className="mt-4 text-xs text-amber-300/80 flex items-start gap-1.5">
            <AlertTriangle size={13} className="flex-none mt-0.5" />
            The single biggest lever is the data layer: the browser talks to Supabase with the anon
            key and no auth bridge, so RLS silently blocks reads/writes. Fixing that alone lifts
            Dashboard, Task Tracker, Notes, Goals and Knowledge together.
          </p>
        </section>

        {/* Per-page */}
        <div className="space-y-3">
          {AUDITS.map((a) => {
            const isOpen = open === a.page;
            const openIssues = a.issues.filter((i) => i.status !== "fixed").length;
            return (
              <section key={a.page} className="rounded-2xl border border-border-default bg-background-surface/30 overflow-hidden">
                <button
                  onClick={() => setOpen(isOpen ? null : a.page)}
                  className="w-full flex items-center gap-4 p-4 sm:p-5 text-left hover:bg-background-elevated/40 transition-colors"
                >
                  <div className={`text-3xl font-semibold w-14 flex-none ${scoreColor(a.current)}`}>
                    {a.current.toFixed(1)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{a.page}</span>
                      {openIssues === 0 ? (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 flex items-center gap-1">
                          <Check size={10} /> clear
                        </span>
                      ) : (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-300">
                          {openIssues} open
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-text-muted mt-0.5 line-clamp-1">{a.verdict}</p>
                  </div>
                  <ChevronDown
                    size={16}
                    className={`flex-none text-text-muted transition-transform ${isOpen ? "rotate-180" : ""}`}
                  />
                </button>

                {isOpen && (
                  <div className="px-4 sm:px-5 pb-5 space-y-4 border-t border-border-default pt-4">
                    <p className="text-sm text-text-secondary">{a.verdict}</p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <Bar label="Accuracy" value={a.dims.accuracy} />
                      <Bar label="Implementation" value={a.dims.implementation} />
                      <Bar label="Execution" value={a.dims.execution} />
                      <Bar label="Results" value={a.dims.results} />
                    </div>
                    <div className="space-y-2">
                      {a.issues.map((i, idx) => (
                        <div
                          key={idx}
                          className="rounded-xl border border-border-default bg-background-base p-3 space-y-2"
                        >
                          <div className="flex items-start gap-2">
                            <span className={`text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded border flex-none ${SEV_STYLE[i.severity]}`}>
                              {i.severity}
                            </span>
                            <span className="text-sm text-text-primary flex-1">{i.text}</span>
                            {i.status === "fixed" ? (
                              <span className="text-emerald-400 flex-none flex items-center gap-1 text-xs"><Check size={13} /> fixed</span>
                            ) : (
                              <span className="text-rose-400 flex-none flex items-center gap-1 text-xs"><X size={13} /> open</span>
                            )}
                          </div>
                          <div className="flex items-start gap-2 text-xs text-text-muted">
                            <Wrench size={12} className="flex-none mt-0.5 text-[#4FC3F7]" />
                            <span>{i.fix}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </section>
            );
          })}
        </div>
      </div>
    </MainLayout>
  );
}

function Stat({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="rounded-xl border border-border-default bg-background-base px-3 py-2">
      <div className="text-[9px] uppercase tracking-wider text-text-muted">{label}</div>
      <div className={`text-lg font-semibold ${danger ? "text-rose-400" : "text-text-primary"}`}>{value}</div>
    </div>
  );
}
