"use client";

import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  X, Loader2, Sparkles, AlertTriangle, Check, Download, Copy, FileText, ShieldAlert,
  ExternalLink, ClipboardList,
} from "lucide-react";
import { useJobAgent } from "@/hooks/useJobAgent";
import type { ApplicationKit, NormalizedJob } from "@/lib/jobAgent/types";
import { resumeToHtml, resumeToMarkdown, resumeToText, coverLetterToHtml, coverLetterToText } from "@/lib/jobAgent/documents";
import { documentFilename } from "@/lib/jobAgent/normalize";
import { dataInsert } from "@/lib/dataClient";

type Tab = "resume" | "cover" | "answers";

export function ApplicationKitReview({ job, onClose }: { job: NormalizedJob; onClose: () => void }) {
  const { profile, facts, upsertApplication } = useJobAgent();
  const [kit, setKit] = useState<ApplicationKit | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("resume");
  const [approved, setApproved] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true); setError(null);
      try {
        const res = await fetch("/api/job-agent/application-kit", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ job, profile, facts, questions: [] }),
        });
        const d = await res.json();
        if (cancelled) return;
        if (!res.ok) { setError(d.error || `HTTP ${res.status}`); return; }
        setKit(d.kit);
      } catch { if (!cancelled) setError("Generation failed — please try again."); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [job, profile, facts]);

  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text).then(() => { setCopied(key); setTimeout(() => setCopied(null), 1200); });
  }

  function printDoc(html: string) {
    const w = window.open("", "_blank", "width=820,height=1000");
    if (!w) return;
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 300);
  }

  function download(text: string, filename: string, mime: string) {
    const blob = new Blob([text], { type: mime });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function approve() {
    if (!kit) return;
    const fullName = profile.fullName || "Candidate";
    const resumeId = `resume_${Date.now().toString(36)}`;
    const coverId = `cover_${Date.now().toString(36)}`;
    // Persist immutable snapshots (best-effort; localStorage fallback handled by dataClient).
    await dataInsert("resume_documents", {
      id: resumeId, name: `${job.company} — ${job.title}`, target_job_id: job.id,
      document_json: kit.resume, template_id: kit.resume.templateId, version_number: 1,
      validation_json: { warnings: kit.warnings }, generation_metadata_json: { generatedAt: kit.generatedAt, provider: kit.provider },
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).catch(() => {});
    await dataInsert("cover_letters", {
      id: coverId, target_job_id: job.id, title: `${job.company} — ${job.title}`,
      document_json: kit.coverLetter, version_number: 1, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).catch(() => {});
    await upsertApplication({
      id: `app_${Date.now().toString(36)}`, job_id: job.id, job_json: job, status: "ready_to_apply",
      match_score: kit.match.overallScore, submitted_resume_id: resumeId, submitted_cover_letter_id: coverId,
      submission_url: job.applyUrl, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    });
    setApproved(true);
  }

  const role = job.title;
  const name = profile.fullName || "Candidate";

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-start justify-center p-2 sm:p-6 overflow-y-auto" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-background-elevated border border-border-default rounded-card w-full max-w-4xl my-4">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border-default sticky top-0 bg-background-elevated z-10">
          <Sparkles size={16} className="text-[#4FC3F7]" />
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-text-primary text-sm truncate">Tailor &amp; Apply — {job.title}</div>
            <div className="text-[11px] text-text-muted">{job.company} · {job.sourceAttribution}</div>
          </div>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary"><X size={18} /></button>
        </div>

        {loading && <div className="py-20 flex flex-col items-center gap-3 text-text-muted"><Loader2 size={22} className="animate-spin text-[#4FC3F7]" /><span className="text-sm">Analyzing the role and tailoring your documents…</span></div>}
        {error && <div className="p-6 text-sm text-accent-red flex items-center gap-2"><AlertTriangle size={15} /> {error}</div>}

        {kit && !loading && (
          <div className="p-5 space-y-5">
            {/* Match + eligibility */}
            <div className="rounded-card border border-border-default bg-background-surface/40 p-4 flex flex-wrap items-center gap-4">
              <div><div className="text-2xl font-bold text-[#4FC3F7]">{kit.match.overallScore}</div><div className="text-[10px] font-mono text-text-muted uppercase">match score</div></div>
              <div className="text-xs text-text-secondary flex-1 min-w-[180px]">
                <div className="font-mono uppercase text-[10px] text-text-muted">recommended: {kit.match.recommendedAction.replace(/_/g, " ")}</div>
                <div className="mt-0.5">Confidence {Math.round(kit.match.confidence * 100)}% · {kit.match.eligibility.replace(/_/g, " ")}</div>
              </div>
            </div>

            {/* Warnings (never buried) */}
            {kit.warnings.length > 0 && (
              <div className="rounded-card border border-[#F0C94E]/30 bg-[#F0C94E]/5 p-3">
                <div className="flex items-center gap-2 text-[#F0C94E] text-xs font-semibold mb-1"><AlertTriangle size={13} /> Review these before applying</div>
                <ul className="text-[11px] text-text-secondary list-disc pl-5 space-y-0.5">{kit.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
              </div>
            )}
            {kit.needsInformation.length > 0 && (
              <div className="rounded-card border border-border-default bg-background-surface/30 p-3">
                <div className="text-xs font-semibold text-text-secondary mb-1">Needs your input</div>
                <ul className="text-[11px] text-text-muted list-disc pl-5 space-y-0.5">{kit.needsInformation.map((w, i) => <li key={i}>{w}</li>)}</ul>
              </div>
            )}

            {/* Tabs */}
            <div className="flex items-center gap-1 border-b border-border-default">
              {([["resume", "Resume"], ["cover", "Cover letter"], ["answers", "Screening"]] as [Tab, string][]).map(([id, label]) => (
                <button key={id} onClick={() => setTab(id)} className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === id ? "border-[#4FC3F7] text-[#4FC3F7]" : "border-transparent text-text-muted hover:text-text-secondary"}`}>{label}</button>
              ))}
            </div>

            {tab === "resume" && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <button onClick={() => printDoc(resumeToHtml(kit.resume, { forPrint: true }))} className={exBtn}><FileText size={12} /> Print / Save PDF</button>
                  <button onClick={() => download(resumeToMarkdown(kit.resume), documentFilename(name, job.company, role, "Resume", "md"), "text/markdown")} className={exBtn}><Download size={12} /> .md</button>
                  <button onClick={() => download(resumeToText(kit.resume), documentFilename(name, job.company, role, "Resume", "txt"), "text/plain")} className={exBtn}><Download size={12} /> .txt</button>
                  <button onClick={() => copy(resumeToText(kit.resume), "resume")} className={exBtn}>{copied === "resume" ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />} Copy</button>
                  {kit.resume.unsupportedKeywords && kit.resume.unsupportedKeywords.length > 0 && (
                    <span className="text-[10px] text-accent-red font-mono ml-1">unsupported keywords omitted: {kit.resume.unsupportedKeywords.join(", ")}</span>
                  )}
                </div>
                <div className="rounded-card border border-border-default bg-white text-black p-5 max-h-[360px] overflow-y-auto text-[13px]" dangerouslySetInnerHTML={{ __html: resumeToHtml(kit.resume) }} />
              </div>
            )}

            {tab === "cover" && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <button onClick={() => printDoc(coverLetterToHtml(kit.coverLetter, { forPrint: true }))} className={exBtn}><FileText size={12} /> Print / Save PDF</button>
                  <button onClick={() => download(coverLetterToText(kit.coverLetter), documentFilename(name, job.company, role, "Cover_Letter", "txt"), "text/plain")} className={exBtn}><Download size={12} /> .txt</button>
                  <button onClick={() => copy(coverLetterToText(kit.coverLetter), "cover")} className={exBtn}>{copied === "cover" ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />} Copy</button>
                </div>
                <div className="rounded-card border border-border-default bg-white text-black p-5 max-h-[360px] overflow-y-auto text-[13px]" dangerouslySetInnerHTML={{ __html: coverLetterToHtml(kit.coverLetter) }} />
              </div>
            )}

            {tab === "answers" && (
              <div className="space-y-2">
                {kit.screeningAnswers.length === 0 && <p className="text-sm text-text-muted py-4">No screening questions were detected. Add them from the employer's form and re-run, or use the assistant below.</p>}
                {kit.screeningAnswers.map((a, i) => (
                  <div key={i} className="rounded-input border border-border-default bg-background-surface/40 p-3">
                    <div className="text-xs font-medium text-text-primary">{a.question}</div>
                    {a.requiresUserInput ? (
                      <div className="mt-1 text-[11px] text-[#F0C94E] flex items-center gap-1.5"><ShieldAlert size={12} /> {a.warning || "You must answer this yourself."}</div>
                    ) : (
                      <div className="mt-1 text-sm text-text-secondary flex items-start gap-2"><span className="flex-1">{a.answer}</span><button onClick={() => copy(a.answer, `ans${i}`)} className="text-text-muted hover:text-text-primary flex-none">{copied === `ans${i}` ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}</button></div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Approve + apply (NO silent submission) */}
            <div className="rounded-card border border-border-default bg-background-surface/40 p-4">
              {!approved ? (
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex-1 text-xs text-text-muted">Approving saves an immutable snapshot of these documents to your tracker. <strong className="text-text-secondary">Nothing is submitted automatically</strong> — you apply on the employer's site yourself.</div>
                  <button onClick={approve} className="flex items-center gap-2 px-4 py-2.5 rounded-input bg-[#34D399] text-[#07070F] text-sm font-semibold hover:brightness-110"><Check size={15} /> Approve &amp; save</button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-[#34D399] text-sm"><Check size={15} /> Approved and saved to your applications.</div>
                  <div className="rounded-input border border-border-default bg-background-base p-3">
                    <div className="flex items-center gap-2 text-xs font-semibold text-text-secondary mb-2"><ClipboardList size={13} /> Application assistant (side-by-side)</div>
                    <p className="text-[11px] text-text-muted mb-2">Open the employer's posting, then copy your approved answers and download your documents. You review CAPTCHA, attestations, and the final submit yourself.</p>
                    <div className="flex flex-wrap gap-2">
                      <a href={job.applyUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 px-3 py-1.5 rounded-input bg-[#4FC3F7] text-[#07070F] text-xs font-semibold hover:brightness-110"><ExternalLink size={13} /> Open application</a>
                      <button onClick={() => printDoc(resumeToHtml(kit.resume, { forPrint: true }))} className={exBtn}><FileText size={12} /> Resume PDF</button>
                      <button onClick={() => printDoc(coverLetterToHtml(kit.coverLetter, { forPrint: true }))} className={exBtn}><FileText size={12} /> Cover PDF</button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <p className="text-[10px] text-text-muted text-center">Match scores are a candidate-side relevance heuristic — not an employer decision or a guarantee of an interview or offer.</p>
          </div>
        )}
      </div>
    </div>
  );
}

const exBtn = "flex items-center gap-1.5 px-2.5 py-1.5 rounded-input border border-border-default text-[11px] text-text-secondary hover:text-text-primary";
