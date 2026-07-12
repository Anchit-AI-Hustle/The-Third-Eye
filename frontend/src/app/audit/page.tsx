"use client";

import { useMemo, useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import {
  ShieldCheck, Check, X, AlertTriangle, ChevronDown, Wrench, Target as TargetIcon,
} from "lucide-react";

/**
 * App Audit — an honest, self-critical review of every LHS page.
 *
 * Scores are on 0–10 across four dimensions (accuracy, implementation,
 * execution, results). "Current" is the state at audit time; "Target" is what
 * the page reaches once the listed fixes land. We do NOT fabricate a 9.5 — the
 * only honest way to a 9.5 is to fix the issues, so each issue tracks whether
 * it is already `fixed` or still `pending`.
 */

type Status = "fixed" | "pending" | "in-progress";
type Severity = "critical" | "high" | "medium" | "low";

interface Issue {
  severity: Severity;
  text: string;
  fix: string;
  status: Status;
}

interface Dims {
  accuracy: number;
  implementation: number;
  execution: number;
  results: number;
}

interface Audit {
  page: string;
  href: string;
  current: number;
  target: number;
  dims: Dims;
  verdict: string;
  issues: Issue[];
}

const AUDITS: Audit[] = [
  {
    page: "Dashboard",
    href: "/dashboard",
    current: 8.0,
    target: 9.5,
    dims: { accuracy: 8, implementation: 8, execution: 8, results: 8 },
    verdict:
      "Data now flows: reads/writes go through a server route scoped to your session, so RLS no longer silently blocks them. A duplicated task list and thin empty states are what's left.",
    issues: [
      { severity: "critical", text: "Browser Supabase client used the anon key with no NextAuth→Supabase bridge, so RLS blocked reads/writes once Supabase was configured.", fix: "Moved all reads/writes to a server route (/api/data/[entity]) that authenticates via the session and uses the service-role client scoped to the user's email.", status: "fixed" },
      { severity: "medium", text: "Task list is duplicated in DashboardClient.tsx (two near-identical render blocks).", fix: "Extract one <TaskList> and render it once.", status: "pending" },
      { severity: "low", text: "Empty/loading states are thin — a fresh account looks broken rather than empty.", fix: "Add explicit skeleton + 'nothing yet' states per card.", status: "pending" },
    ],
  },
  {
    page: "Assistant",
    href: "/assistant",
    current: 7.5,
    target: 9.5,
    dims: { accuracy: 8, implementation: 7, execution: 8, results: 7 },
    verdict:
      "The strongest page. Streaming chat, Dictate mode, honest ✓/✗ action results, and a cascade fallback all work. Loses points on the agent profile being partly cosmetic and side-effects that can't be undone.",
    issues: [
      { severity: "high", text: "Selected agent profile (JARVIS/FRIDAY/etc.) barely changes model behaviour — mostly a voice label.", fix: "Feed the profile persona into the system prompt and TTS voice selection consistently.", status: "pending" },
      { severity: "medium", text: "Agent actions apply immediately with no undo.", fix: "Add an undo affordance / confirmation for destructive side-effects (delete task/note/goal).", status: "pending" },
    ],
  },
  {
    page: "Task Tracker",
    href: "/tasks",
    current: 8.0,
    target: 9.5,
    dims: { accuracy: 8, implementation: 8, execution: 8, results: 8 },
    verdict:
      "Was the weakest core page; the two blockers are fixed. Writes persist through the server route and the missing columns are added by a migration. A 'cancelled' Kanban lane is the remaining polish.",
    issues: [
      { severity: "critical", text: "tasks table lacked assignee / start_date / completed_at columns that the UI reads and writes.", fix: "Added via migration supabase-schema-tasks-ui.sql (nullable). Apply it once in the Supabase SQL editor.", status: "fixed" },
      { severity: "critical", text: "Writes went through the anon client and failed under RLS with no surfaced error.", fix: "Writes now go through the server route (service-role, scoped to your email) with optimistic UI updates.", status: "fixed" },
      { severity: "medium", text: "Kanban has no 'cancelled' column though status supports it.", fix: "Add the cancelled lane.", status: "pending" },
    ],
  },
  {
    page: "Notes",
    href: "/notes",
    current: 9.0,
    target: 9.5,
    dims: { accuracy: 9, implementation: 9, execution: 9, results: 9 },
    verdict: "Capture and persistence work through the server route, and autosave is debounced so it no longer writes on every keystroke.",
    issues: [
      { severity: "high", text: "Notes didn't reliably survive a reload when Supabase was on (anon/RLS gap).", fix: "Now persisted via the server route, with optimistic UI updates.", status: "fixed" },
      { severity: "medium", text: "Autosave wrote on every keystroke.", fix: "Debounced to ~500ms, coalescing edits and flushing on note switch / unmount.", status: "fixed" },
    ],
  },
  {
    page: "Goals",
    href: "/goals",
    current: 9.0,
    target: 9.5,
    dims: { accuracy: 9, implementation: 9, execution: 9, results: 9 },
    verdict: "Persistence works through the server route and the progress maths is guarded. Solid.",
    issues: [
      { severity: "high", text: "Division by zero when a goal had target 0 → NaN% progress.", fix: "Guarded the denominator: a 0/empty target reads as 0% until set.", status: "fixed" },
      { severity: "high", text: "Anon/RLS persistence gap.", fix: "Now persisted via the server route.", status: "fixed" },
    ],
  },
  {
    page: "Knowledge",
    href: "/knowledge",
    current: 7.5,
    target: 9.5,
    dims: { accuracy: 7, implementation: 8, execution: 8, results: 7 },
    verdict: "Docs now persist through the server route. The remaining gap is the \"RAG / pgvector\" claim vs. the keyword search that actually runs client-side.",
    issues: [
      { severity: "high", text: "\"RAG / pgvector\" claim vs. actual keyword search.", fix: "Either wire real embeddings + vector search (a /api/cortex path exists), or relabel as keyword search until it exists.", status: "pending" },
      { severity: "high", text: "Anon/RLS persistence gap.", fix: "Now persisted via the server route.", status: "fixed" },
    ],
  },
  {
    page: "Finance",
    href: "/finance",
    current: 8.0,
    target: 9.5,
    dims: { accuracy: 8, implementation: 8, execution: 8, results: 8 },
    verdict: "Was a placeholder; now a working expense tracker — log by natural language (\"250 coffee\") or voice, one-tap categories, month totals, category breakdown and recent transactions, all persisted per-user. Bank/card sync is the remaining stretch.",
    issues: [
      { severity: "critical", text: "No connected data source; numbers were static/sample.", fix: "Built a real expense tracker (amount/category/note/date) persisted via the server data route, with NL + voice quick-add.", status: "fixed" },
      { severity: "low", text: "No automatic bank/card import yet.", fix: "Optional: add statement import or an aggregator; manual + NL entry covers the core need.", status: "pending" },
    ],
  },
  {
    page: "Capabilities",
    href: "/capabilities",
    current: 8.5,
    target: 9.5,
    dims: { accuracy: 9, implementation: 8, execution: 9, results: 8 },
    verdict: "An honest inventory of live/partial/planned — now gated behind auth, with the overstated RAG badges corrected to match reality.",
    issues: [
      { severity: "high", text: "Page had no auth guard (deployment info exposed to anon).", fix: "Added /capabilities (and other app routes) to the middleware matcher.", status: "fixed" },
      { severity: "medium", text: "Knowledge/Document Q&A were badged 'live' as RAG, but run keyword search.", fix: "Downgraded to 'partial' and relabelled as keyword search until embeddings land.", status: "fixed" },
    ],
  },
  {
    page: "Settings",
    href: "/settings",
    current: 7.3,
    target: 9.5,
    dims: { accuracy: 7, implementation: 8, execution: 7, results: 7 },
    verdict: "Solid after the Connections card landed — Google connect flow and status badges work. Minor: some toggles are cosmetic.",
    issues: [
      { severity: "medium", text: "A few preference toggles don't persist / don't do anything yet.", fix: "Wire each toggle to real state or hide it.", status: "pending" },
    ],
  },
  {
    page: "Kolab",
    href: "/kolab",
    current: 7.0,
    target: 9.5,
    dims: { accuracy: 7, implementation: 7, execution: 7, results: 7 },
    verdict: "Embedded cleanly and re-themed to The Third Eye; XSS sinks were hardened and privileged data moved to env. One session-persistence bug remains.",
    issues: [
      { severity: "high", text: "Sessions didn't survive a reload, and the local sign-in was separate from the app's Google login.", fix: "Restore the session from the same-origin Third Eye NextAuth session on every load (no separate Kolab sign-in, no PII written to localStorage).", status: "fixed" },
      { severity: "critical", text: "/api/kolab/config exposed real personal numbers to anonymous callers.", fix: "Auth-gate the route (401 without a session).", status: "fixed" },
    ],
  },
  {
    page: "Navigation & Shell",
    href: "/dashboard",
    current: 7.8,
    target: 9.5,
    dims: { accuracy: 8, implementation: 8, execution: 8, results: 7 },
    verdict: "Sidebar + bottom nav are consistent and the mobile safe-area overlap is fixed. Missing only the Audit entry (this page) and a couple of active-state edge cases.",
    issues: [
      { severity: "low", text: "No entry point to this audit.", fix: "Add 'App Audit' at the top of the sidebar.", status: "fixed" },
    ],
  },
  {
    page: "Backend / API layer",
    href: "/settings",
    current: 5.5,
    target: 9.5,
    dims: { accuracy: 6, implementation: 5, execution: 6, results: 5 },
    verdict:
      "Cascade + connectors are real, but three routes were open to anonymous callers and the NextAuth secret fell back to a hard-coded string. Those are fixed; the auth-bridge and a few medium hardening items remain.",
    issues: [
      { severity: "critical", text: "/api/llm and /api/transcribe were open — anyone could spend provider credits.", fix: "Require a signed-in session (401 otherwise); cap audio at 25 MB.", status: "fixed" },
      { severity: "critical", text: "NEXTAUTH_SECRET fell back to a hard-coded string — session JWTs were forgeable.", fix: "Fail closed in production; dev + build phase exempted.", status: "fixed" },
      { severity: "medium", text: "Cron secret passed via query string; host-header open-redirect risk; prompt-injection surface in chat.", fix: "Move cron secret to header; validate redirect host allowlist; add injection guards.", status: "pending" },
    ],
  },
];

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
            An honest, self-critical review of every page — rated on accuracy, implementation,
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
