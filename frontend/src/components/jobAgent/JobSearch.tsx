"use client";

import { useMemo, useState } from "react";
import {
  Search, Loader2, Bookmark, X, ExternalLink, Sparkles, Check, MapPin, Building2,
  AlertTriangle, ChevronDown,
} from "lucide-react";
import { useJobAgent } from "@/hooks/useJobAgent";
import { scoreMatch } from "@/lib/jobAgent/match";
import type { JobSearchResult, NormalizedJob, RemotePreference } from "@/lib/jobAgent/types";
import { ApplicationKitReview } from "./ApplicationKitReview";

const REMOTE_OPTS: { value: RemotePreference; label: string }[] = [
  { value: "any", label: "Any" }, { value: "remote", label: "Remote" }, { value: "hybrid", label: "Hybrid" }, { value: "onsite", label: "Onsite" },
];
const SOURCE_TOGGLES = [
  { id: "remotive", label: "Remotive" }, { id: "arbeitnow", label: "Arbeitnow" }, { id: "adzuna", label: "Adzuna" },
  { id: "linkedin", label: "LinkedIn" }, { id: "indeed", label: "Indeed" }, { id: "glassdoor", label: "Glassdoor" }, { id: "upwork", label: "Upwork" },
];

export function JobSearch() {
  const { profile, facts, saved, setJobState } = useJobAgent();
  const [query, setQuery] = useState("");
  const [location, setLocation] = useState("");
  const [remote, setRemote] = useState<RemotePreference>("any");
  const [sources, setSources] = useState<string[]>(SOURCE_TOGGLES.map((s) => s.id));
  const [result, setResult] = useState<JobSearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [minScore, setMinScore] = useState(0);
  const [kitJob, setKitJob] = useState<NormalizedJob | null>(null);

  const savedIds = useMemo(() => new Map(saved.map((s) => [s.job_id, s.state])), [saved]);

  async function run(e?: React.FormEvent) {
    e?.preventDefault();
    if (!query.trim()) return;
    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/job-agent/search", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, location, remotePreference: remote, sources, limit: 30 }),
      });
      const d = await res.json();
      if (!res.ok) { setError(d.error || `HTTP ${res.status}`); return; }
      setResult(d);
    } catch { setError("Search failed — check your connection."); }
    finally { setLoading(false); }
  }

  const scored = useMemo(() => {
    if (!result) return [];
    return result.jobs
      .filter((j) => savedIds.get(j.id) !== "dismissed")
      .map((j) => ({ job: j, match: scoreMatch(j, profile, facts) }))
      .filter((x) => x.match.overallScore >= minScore)
      .sort((a, b) => b.match.overallScore - a.match.overallScore);
  }, [result, profile, facts, savedIds, minScore]);

  const externalLinks = result?.sources.filter((s) => s.state === "external-search") as { id: string; displayName: string; url: string }[] | undefined;

  return (
    <div className="space-y-5">
      {/* Search form */}
      <form onSubmit={run} className="rounded-card border border-border-default bg-background-surface/40 p-4 space-y-3">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="flex-1 flex items-center gap-2 bg-background-base border border-border-default rounded-input px-3 py-2.5">
            <Search size={15} className="text-text-muted flex-none" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Role, skill, or keyword…" className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-muted outline-none" />
          </div>
          <div className="flex items-center gap-2 bg-background-base border border-border-default rounded-input px-3 py-2.5 sm:w-56">
            <MapPin size={15} className="text-text-muted flex-none" />
            <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Location (optional)" className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-muted outline-none" />
          </div>
          <button type="submit" disabled={loading || !query.trim()} className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-input bg-[#4FC3F7] text-[#07070F] text-sm font-semibold hover:brightness-110 disabled:opacity-50">
            {loading ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />} Search
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {REMOTE_OPTS.map((o) => (
            <button key={o.value} type="button" onClick={() => setRemote(o.value)}
              className={`px-2.5 py-1 rounded-full text-[11px] border ${remote === o.value ? "border-[#4FC3F7] text-[#4FC3F7] bg-[#4FC3F7]/10" : "border-border-default text-text-muted"}`}>{o.label}</button>
          ))}
          <span className="w-px h-4 bg-border-default mx-1" />
          {SOURCE_TOGGLES.map((s) => {
            const on = sources.includes(s.id);
            return (
              <button key={s.id} type="button" onClick={() => setSources((prev) => on ? prev.filter((x) => x !== s.id) : [...prev, s.id])}
                className={`px-2.5 py-1 rounded-full text-[11px] border ${on ? "border-[#34D399] text-[#34D399] bg-[#34D399]/10" : "border-border-default text-text-muted"}`}>{s.label}</button>
            );
          })}
        </div>
      </form>

      {error && <p className="text-sm text-accent-red flex items-center gap-2"><AlertTriangle size={14} /> {error}</p>}

      {/* Source status */}
      {result && (
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          {result.sources.map((s) => {
            const color = s.state === "complete" ? "#34D399" : s.state === "external-search" ? "#4FC3F7" : s.state === "unconfigured" ? "#7878A8" : "#EF4444";
            const label = s.state === "complete" ? `${s.count} results` : s.state === "external-search" ? "open search" : s.state === "unconfigured" ? "not configured" : s.state === "timed_out" ? "timed out" : "unavailable";
            return (
              <span key={s.id} className="flex items-center gap-1.5 px-2 py-1 rounded-full border font-mono" style={{ borderColor: `${color}55`, color }}>
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} /> {s.displayName}: {label}
              </span>
            );
          })}
        </div>
      )}

      {/* External live-search links */}
      {externalLinks && externalLinks.length > 0 && (
        <div className="rounded-card border border-border-default bg-background-surface/30 p-3">
          <div className="hud-label text-text-muted mb-2">Open live search on restricted boards (we never scrape these)</div>
          <div className="flex flex-wrap gap-2">
            {externalLinks.map((l) => (
              <a key={l.id} href={l.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 px-3 py-1.5 rounded-input border border-border-default text-xs text-text-secondary hover:text-text-primary hover:border-[#4FC3F7]/40">
                <ExternalLink size={12} /> {l.displayName}
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="flex items-center justify-between">
          <div className="text-xs text-text-muted font-mono">{scored.length} matched jobs · fetched {new Date(result.fetchedAt).toLocaleTimeString()}</div>
          <label className="flex items-center gap-2 text-xs text-text-muted">Min score
            <input type="range" min={0} max={90} step={5} value={minScore} onChange={(e) => setMinScore(Number(e.target.value))} className="accent-[#4FC3F7]" />
            <span className="font-mono w-6">{minScore}</span>
          </label>
        </div>
      )}

      <div className="space-y-3">
        {loading && !result && <div className="flex justify-center py-16"><Loader2 className="animate-spin text-text-muted" /></div>}
        {scored.map(({ job, match }) => (
          <JobCard key={job.id} job={job} match={match} savedState={savedIds.get(job.id)} onSave={() => setJobState(job, "saved")} onDismiss={() => setJobState(job, "dismissed")} onApply={() => setKitJob(job)} />
        ))}
        {result && scored.length === 0 && !loading && (
          <p className="text-sm text-text-muted py-10 text-center">No inline results matched. Try the external live-search links above, or broaden your query.</p>
        )}
      </div>

      {kitJob && <ApplicationKitReview job={kitJob} onClose={() => setKitJob(null)} />}
    </div>
  );
}

function eligibilityBadge(e: string): { label: string; color: string } {
  switch (e) {
    case "eligible": case "likely_eligible": return { label: "Likely eligible", color: "#34D399" };
    case "likely_ineligible": return { label: "Eligibility conflict", color: "#EF4444" };
    default: return { label: "Eligibility uncertain", color: "#F0C94E" };
  }
}

function JobCard({ job, match, savedState, onSave, onDismiss, onApply }: {
  job: NormalizedJob; match: ReturnType<typeof scoreMatch>; savedState?: string;
  onSave: () => void; onDismiss: () => void; onApply: () => void;
}) {
  const [open, setOpen] = useState(false);
  const elig = eligibilityBadge(match.eligibility);
  const scoreColor = match.overallScore >= 70 ? "#34D399" : match.overallScore >= 50 ? "#4FC3F7" : "#F0C94E";
  return (
    <div className="rounded-card border border-border-default bg-background-surface/40 p-4">
      <div className="flex items-start gap-3">
        <div className="flex-none w-11 h-11 rounded-lg bg-background-base border border-border-default flex items-center justify-center overflow-hidden">
          {job.companyLogoUrl ? <img src={job.companyLogoUrl} alt="" className="w-full h-full object-cover" /> : <Building2 size={18} className="text-text-muted" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-text-primary">{job.title}</div>
              <div className="text-xs text-text-secondary">{job.company}</div>
            </div>
            <div className="flex-none text-right">
              <div className="text-lg font-bold" style={{ color: scoreColor }}>{match.overallScore}</div>
              <div className="text-[9px] font-mono text-text-muted uppercase">match · conf {Math.round(match.confidence * 100)}%</div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-2 text-[11px] text-text-muted font-mono">
            {job.locationText && <span>{job.locationText}</span>}
            {job.remoteType && <span className="text-[#34D399]">{job.remoteType}</span>}
            {job.employmentType && <span>{job.employmentType}</span>}
            {(job.salaryMin || job.salaryMax) && <span className="text-[#34D399]">{job.salaryCurrency || ""} {job.salaryMin ?? ""}{job.salaryMax ? `–${job.salaryMax}` : ""}</span>}
            <span className="px-1.5 py-0.5 rounded-full border" style={{ borderColor: `${elig.color}55`, color: elig.color }}>{elig.label}</span>
            <span>· {job.sourceAttribution}</span>
          </div>

          {match.penaltiesApplied.length > 0 && (
            <div className="mt-2 text-[11px] text-accent-red flex items-start gap-1.5"><AlertTriangle size={12} className="flex-none mt-0.5" /><span>{match.penaltiesApplied.join(" ")}</span></div>
          )}

          <button onClick={() => setOpen((v) => !v)} className="mt-2 text-[11px] text-text-muted hover:text-text-secondary flex items-center gap-1">
            <ChevronDown size={12} className={open ? "rotate-180 transition-transform" : "transition-transform"} /> Match details
          </button>
          {open && (
            <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-3 text-[11px]">
              <div>
                <div className="text-text-muted mb-1">Score breakdown</div>
                {match.breakdown.map((b) => (
                  <div key={b.key} className="flex items-center gap-2">
                    <span className="w-28 text-text-muted truncate">{b.label}</span>
                    <span className="flex-1 h-1.5 rounded-full bg-border-default overflow-hidden"><span className="block h-full" style={{ width: `${b.score}%`, background: scoreColor }} /></span>
                    <span className="w-7 text-right font-mono text-text-secondary">{b.score}</span>
                  </div>
                ))}
              </div>
              <div>
                {match.matchedRequirements.length > 0 && <><div className="text-text-muted mb-1">Matched (from your facts)</div><div className="flex flex-wrap gap-1 mb-2">{match.matchedRequirements.slice(0, 8).map((m, i) => <span key={i} className="px-1.5 py-0.5 rounded bg-[#34D399]/10 text-[#34D399]">{m.requirement}</span>)}</div></>}
                {match.missingRequirements.length > 0 && <><div className="text-text-muted mb-1">Missing</div><div className="flex flex-wrap gap-1">{match.missingRequirements.slice(0, 6).map((m, i) => <span key={i} className="px-1.5 py-0.5 rounded bg-accent-red/10 text-accent-red">{m.slice(0, 40)}</span>)}</div></>}
              </div>
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button onClick={onApply} className="flex items-center gap-1.5 px-3 py-1.5 rounded-input bg-[#4FC3F7] text-[#07070F] text-xs font-semibold hover:brightness-110"><Sparkles size={13} /> Tailor &amp; Apply</button>
            <button onClick={onSave} disabled={savedState === "saved"} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-input border text-xs ${savedState === "saved" ? "border-[#34D399]/40 text-[#34D399]" : "border-border-default text-text-secondary hover:text-text-primary"}`}>
              {savedState === "saved" ? <><Check size={13} /> Saved</> : <><Bookmark size={13} /> Save</>}
            </button>
            <button onClick={onDismiss} className="flex items-center gap-1.5 px-3 py-1.5 rounded-input border border-border-default text-text-muted hover:text-accent-red text-xs"><X size={13} /> Dismiss</button>
            <a href={job.applyUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 px-3 py-1.5 rounded-input border border-border-default text-text-secondary hover:text-text-primary text-xs"><ExternalLink size={13} /> Original</a>
          </div>
        </div>
      </div>
    </div>
  );
}
