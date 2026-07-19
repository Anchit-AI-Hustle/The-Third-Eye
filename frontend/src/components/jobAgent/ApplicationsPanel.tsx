"use client";

import { useState } from "react";
import { Loader2, ExternalLink, Building2, Download } from "lucide-react";
import { useJobAgent, type ApplicationRow } from "@/hooks/useJobAgent";

const STATUSES = [
  "preparing", "needs_review", "ready_to_apply", "applying", "submitted",
  "recruiter_contact", "assessment", "interview", "final_interview", "offer",
  "accepted", "rejected", "withdrawn", "archived",
];

const STATUS_COLOR: Record<string, string> = {
  submitted: "#4FC3F7", interview: "#A78BFA", final_interview: "#A78BFA", offer: "#34D399",
  accepted: "#34D399", rejected: "#EF4444", withdrawn: "#7878A8", archived: "#7878A8",
};

export function ApplicationsPanel() {
  const { ready, applications, updateApplication } = useJobAgent();
  const [filter, setFilter] = useState("all");

  if (!ready) return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-text-muted" /></div>;

  const shown = filter === "all" ? applications : applications.filter((a) => a.status === filter);

  function exportCsv() {
    const header = "Company,Role,Status,Match,Applied,Follow-up,URL";
    const rows = applications.map((a) => [a.job_json?.company ?? "", a.job_json?.title ?? "", a.status, a.match_score ?? "", a.created_at, a.follow_up_at ?? "", a.submission_url ?? ""]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","));
    const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = `job-applications-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(a.href);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => setFilter("all")} className={chip(filter === "all")}>All ({applications.length})</button>
          {["ready_to_apply", "submitted", "interview", "offer", "rejected"].map((s) => (
            <button key={s} onClick={() => setFilter(s)} className={chip(filter === s)}>{s.replace(/_/g, " ")}</button>
          ))}
        </div>
        <button onClick={exportCsv} disabled={!applications.length} className="flex items-center gap-1.5 px-3 py-2 rounded-input border border-border-default text-text-secondary hover:text-text-primary text-sm disabled:opacity-40"><Download size={13} /> Export CSV</button>
      </div>

      {shown.length === 0 ? (
        <p className="text-sm text-text-muted py-16 text-center rounded-card border border-border-default bg-background-surface/30">
          No applications yet. Tailor & Apply from search to add one here.
        </p>
      ) : (
        <div className="space-y-2">
          {shown.map((a) => <AppRow key={a.id} app={a} onStatus={(s) => updateApplication(a.id, { status: s })} onNotes={(n) => updateApplication(a.id, { notes: n })} onFollow={(d) => updateApplication(a.id, { follow_up_at: d })} />)}
        </div>
      )}
    </div>
  );
}

function AppRow({ app, onStatus, onNotes, onFollow }: { app: ApplicationRow; onStatus: (s: string) => void; onNotes: (n: string) => void; onFollow: (d: string) => void }) {
  const [notes, setNotes] = useState(app.notes || "");
  const color = STATUS_COLOR[app.status] || "#4FC3F7";
  return (
    <div className="rounded-card border border-border-default bg-background-surface/40 p-4">
      <div className="flex items-start gap-3">
        <div className="flex-none w-10 h-10 rounded-lg bg-background-base border border-border-default flex items-center justify-center overflow-hidden">
          {app.job_json?.companyLogoUrl ? <img src={app.job_json.companyLogoUrl} alt="" className="w-full h-full object-cover" /> : <Building2 size={16} className="text-text-muted" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-text-primary truncate">{app.job_json?.title || "Application"}</div>
              <div className="text-xs text-text-muted">{app.job_json?.company} {app.match_score != null && <span className="ml-2">· match {app.match_score}</span>}</div>
            </div>
            <div className="flex items-center gap-2">
              <select value={app.status} onChange={(e) => onStatus(e.target.value)} className="bg-background-base border rounded-input px-2 py-1 text-xs outline-none" style={{ borderColor: `${color}55`, color }}>
                {STATUSES.map((s) => <option key={s} value={s} className="bg-background-base text-text-primary">{s.replace(/_/g, " ")}</option>)}
              </select>
              {app.submission_url && <a href={app.submission_url} target="_blank" rel="noopener noreferrer" className="text-text-muted hover:text-text-primary"><ExternalLink size={14} /></a>}
            </div>
          </div>
          <div className="mt-2 flex flex-col sm:flex-row gap-2">
            <input value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => onNotes(notes)} placeholder="Notes…" className="flex-1 bg-background-base border border-border-default rounded-input px-2.5 py-1.5 text-xs outline-none text-text-primary placeholder:text-text-muted" />
            <input type="date" value={app.follow_up_at?.slice(0, 10) || ""} onChange={(e) => onFollow(e.target.value)} className="bg-background-base border border-border-default rounded-input px-2.5 py-1.5 text-xs outline-none text-text-muted" />
          </div>
        </div>
      </div>
    </div>
  );
}

const chip = (on: boolean) => `px-2.5 py-1 rounded-full text-[11px] border capitalize ${on ? "border-[#4FC3F7] text-[#4FC3F7] bg-[#4FC3F7]/10" : "border-border-default text-text-muted"}`;
