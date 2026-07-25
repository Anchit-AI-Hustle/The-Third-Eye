"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Search, User, Briefcase, Bookmark, ArrowRight, ShieldCheck, Loader2 } from "lucide-react";
import { useJobAgent, profileCompleteness } from "@/hooks/useJobAgent";

export function JobAgentHome() {
  const { ready, profile, facts, saved, applications } = useJobAgent();
  const completeness = useMemo(() => profileCompleteness(profile, facts), [profile, facts]);
  const savedActive = saved.filter((s) => s.state === "saved");
  const needAction = applications.filter((a) => ["needs_review", "preparing", "ready_to_apply"].includes(a.status));

  if (!ready) return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-text-muted" /></div>;

  return (
    <div className="space-y-6">
      {/* Quick search CTA */}
      <div className="rounded-card border border-border-default bg-background-surface/40 p-5 flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex-1">
          <div className="font-semibold text-text-primary">Find your next role</div>
          <p className="text-xs text-text-muted mt-0.5">Search permitted sources, see match scores, and tailor an application.</p>
        </div>
        <Link href="/job-agent/search" className="flex items-center gap-2 px-4 py-2.5 rounded-input bg-[#4FC3F7] text-[#07070F] text-sm font-semibold hover:brightness-110">
          <Search size={16} /> Search jobs
        </Link>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <StatCard href="/job-agent/profile" icon={<User size={18} />} color="#34D399" label="Profile" stat={`${completeness}%`} sub={`${facts.length} verified facts`} />
        <StatCard href="/job-agent/search" icon={<Bookmark size={18} />} color="#4FC3F7" label="Saved jobs" stat={`${savedActive.length}`} sub="ready to tailor" />
        <StatCard href="/job-agent/applications" icon={<Briefcase size={18} />} color="#A78BFA" label="Applications" stat={`${applications.length}`} sub={`${needAction.length} need action`} />
        <StatCard href="/job-agent/profile" icon={<ShieldCheck size={18} />} color="#F0C94E" label="Privacy" stat="Yours" sub="private to your account" />
      </div>

      {/* Profile nudge */}
      {completeness < 60 && (
        <div className="rounded-card border border-[#F0C94E]/30 bg-[#F0C94E]/5 p-4 text-sm text-text-secondary flex items-center gap-3">
          <User size={16} className="text-[#F0C94E] flex-none" />
          <span className="flex-1">Complete your profile so tailoring can cite real, verified evidence — no fabrication.</span>
          <Link href="/job-agent/profile" className="text-[#F0C94E] text-xs font-mono hover:underline flex items-center gap-1">Finish profile <ArrowRight size={12} /></Link>
        </div>
      )}

      {/* Recent saved */}
      <section>
        <div className="hud-label text-text-muted mb-2">Saved jobs</div>
        {savedActive.length === 0 ? (
          <p className="text-sm text-text-muted py-6 text-center rounded-card border border-border-default bg-background-surface/30">
            Nothing saved yet. <Link href="/job-agent/search" className="text-[#4FC3F7] hover:underline">Search jobs →</Link>
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {savedActive.slice(0, 6).map((s) => (
              <div key={s.id} className="rounded-card border border-border-default bg-background-surface/40 p-4">
                <div className="text-sm font-semibold text-text-primary truncate">{s.job_json.title}</div>
                <div className="text-xs text-text-muted">{s.job_json.company} · {s.job_json.locationText || "—"}</div>
                <div className="mt-2 flex items-center gap-2">
                  <a href={s.job_json.applyUrl} target="_blank" rel="noopener noreferrer" className="text-[11px] text-[#4FC3F7] hover:underline">Open posting →</a>
                  <span className="text-[10px] font-mono text-text-muted">{s.job_json.sourceAttribution}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function StatCard({ href, icon, color, label, stat, sub }: { href: string; icon: React.ReactNode; color: string; label: string; stat: string; sub: string }) {
  return (
    <Link href={href} className="group holo-card rounded-card p-4 hud-frame hover:-translate-y-0.5 transition-transform">
      <div className="flex items-center justify-between mb-2">
        <span className="w-9 h-9 rounded-lg flex items-center justify-center flex-none" style={{ background: `${color}1A`, color }}>{icon}</span>
        <ArrowRight size={14} className="text-text-muted group-hover:text-text-primary transition-colors" />
      </div>
      <div className="text-xl font-semibold text-text-primary">{stat}</div>
      <div className="text-sm text-text-secondary">{label}</div>
      <div className="text-[11px] text-text-muted mt-0.5">{sub}</div>
    </Link>
  );
}
