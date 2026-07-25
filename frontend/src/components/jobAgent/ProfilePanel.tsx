"use client";

import { useState } from "react";
import { Loader2, Upload, Check, X, ShieldAlert, Trash2, Save, Link2 } from "lucide-react";
import { useJobAgent } from "@/hooks/useJobAgent";
import type { CandidateFact, CareerProfile } from "@/lib/jobAgent/types";

export function ProfilePanel() {
  const { ready, profile, facts, saveProfile, addFacts, updateFact, removeFact } = useJobAgent();
  const [draft, setDraft] = useState<CareerProfile>(profile);
  const [importText, setImportText] = useState("");
  const [importUrl, setImportUrl] = useState("");
  const [importing, setImporting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Keep draft in sync when the hook finishes loading.
  const [hydrated, setHydrated] = useState(false);
  if (ready && !hydrated) { setDraft(profile); setHydrated(true); }

  const set = (k: keyof CareerProfile) => (v: any) => setDraft((p) => ({ ...p, [k]: v }));

  async function runImport() {
    if (!importText.trim() && !importUrl.trim()) return;
    setImporting(true); setMsg(null);
    try {
      const res = await fetch("/api/job-agent/profile/import", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: importText, sourceUrl: importUrl || undefined }),
      });
      const d = await res.json();
      if (!res.ok) { setMsg(d.error || "Import failed."); return; }
      if (d.profile) { const merged = { ...draft, ...Object.fromEntries(Object.entries(d.profile).filter(([, v]) => v)) }; setDraft(merged); await saveProfile(merged); }
      if (d.facts?.length) await addFacts(d.facts as CandidateFact[]);
      setMsg(`Imported ${d.facts?.length ?? 0} facts. Review and verify them below — nothing is auto-verified.`);
      setImportText(""); setImportUrl("");
    } catch { setMsg("Import failed — please try again."); }
    finally { setImporting(false); }
  }

  async function persist() { await saveProfile(draft); setSaved(true); setTimeout(() => setSaved(false), 1500); }

  if (!ready) return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-text-muted" /></div>;

  return (
    <div className="space-y-6">
      {/* Import */}
      <section className="rounded-card border border-border-default bg-background-surface/40 p-4 sm:p-5">
        <div className="hud-label text-text-muted mb-3">Import resume</div>
        <textarea value={importText} onChange={(e) => setImportText(e.target.value)} rows={5} placeholder="Paste your resume text here… (PDF/DOCX parsing is a staged follow-up — paste text or use a portfolio URL for now)" className={field + " resize-y"} />
        <div className="mt-2 flex flex-col sm:flex-row gap-2">
          <div className="flex-1 flex items-center gap-2 bg-background-base border border-border-default rounded-input px-3 py-2">
            <Link2 size={14} className="text-text-muted" />
            <input value={importUrl} onChange={(e) => setImportUrl(e.target.value)} placeholder="…or a portfolio URL (https://)" className="flex-1 bg-transparent text-sm outline-none text-text-primary placeholder:text-text-muted" />
          </div>
          <button onClick={runImport} disabled={importing || (!importText.trim() && !importUrl.trim())} className="flex items-center justify-center gap-2 px-4 py-2 rounded-input bg-[#34D399] text-[#07070F] text-sm font-semibold hover:brightness-110 disabled:opacity-50">
            {importing ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} Import &amp; extract
          </button>
        </div>
        {msg && <p className="mt-2 text-xs text-[#4FC3F7]">{msg}</p>}
      </section>

      {/* Profile fields */}
      <section className="rounded-card border border-border-default bg-background-surface/40 p-4 sm:p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="hud-label text-text-muted">Profile</div>
          <button onClick={persist} className="flex items-center gap-1.5 px-3 py-1.5 rounded-input bg-[#4FC3F7] text-[#07070F] text-xs font-semibold hover:brightness-110">{saved ? <Check size={13} /> : <Save size={13} />} {saved ? "Saved" : "Save"}</button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Full name"><input value={draft.fullName || ""} onChange={(e) => set("fullName")(e.target.value)} className={field} /></Field>
          <Field label="Headline"><input value={draft.headline || ""} onChange={(e) => set("headline")(e.target.value)} className={field} placeholder="e.g. Senior Growth Marketer" /></Field>
          <Field label="Email"><input value={draft.email || ""} onChange={(e) => set("email")(e.target.value)} className={field} /></Field>
          <Field label="Phone"><input value={draft.phone || ""} onChange={(e) => set("phone")(e.target.value)} className={field} /></Field>
          <Field label="City"><input value={draft.city || ""} onChange={(e) => set("city")(e.target.value)} className={field} /></Field>
          <Field label="Country"><input value={draft.country || ""} onChange={(e) => set("country")(e.target.value)} className={field} /></Field>
          <Field label="Portfolio URL"><input value={draft.portfolioUrl || ""} onChange={(e) => set("portfolioUrl")(e.target.value)} className={field} /></Field>
          <Field label="LinkedIn URL"><input value={draft.linkedinUrl || ""} onChange={(e) => set("linkedinUrl")(e.target.value)} className={field} /></Field>
          <Field label="Years of experience"><input type="number" value={draft.yearsExperience ?? ""} onChange={(e) => set("yearsExperience")(Number(e.target.value) || undefined)} className={field} /></Field>
          <Field label="Work authorization"><input value={draft.workAuthorization || ""} onChange={(e) => set("workAuthorization")(e.target.value)} className={field} placeholder="e.g. Authorized to work in India" /></Field>
          <Field label="Target roles (comma-separated)"><input value={(draft.targetRoles || []).join(", ")} onChange={(e) => set("targetRoles")(e.target.value.split(",").map((s) => s.trim()).filter(Boolean))} className={field} /></Field>
          <Field label="Exclusions / deal-breakers (comma-separated)"><input value={(draft.exclusions || []).join(", ")} onChange={(e) => set("exclusions")(e.target.value.split(",").map((s) => s.trim()).filter(Boolean))} className={field} placeholder="e.g. gambling, night shifts" /></Field>
        </div>
        <Field label="Professional summary"><textarea value={draft.summary || ""} onChange={(e) => set("summary")(e.target.value)} rows={3} className={field + " resize-y"} /></Field>
        <label className="flex items-center gap-2 text-xs text-text-secondary mt-2">
          <input type="checkbox" checked={!!draft.needsSponsorship} onChange={(e) => set("needsSponsorship")(e.target.checked)} className="accent-[#4FC3F7]" /> I require visa sponsorship
        </label>
      </section>

      {/* Fact vault */}
      <section className="rounded-card border border-border-default bg-background-surface/40 p-4 sm:p-5">
        <div className="hud-label text-text-muted mb-1">Fact vault ({facts.length})</div>
        <p className="text-[11px] text-text-muted mb-3">Only <span className="text-[#34D399]">verified</span> facts are used to tailor resumes and cover letters. Nothing is auto-verified.</p>
        {facts.length === 0 ? (
          <p className="text-sm text-text-muted py-6 text-center">No facts yet. Import a resume above to extract them.</p>
        ) : (
          <div className="space-y-1.5 max-h-[420px] overflow-y-auto">
            {facts.map((f) => <FactRow key={f.id} fact={f} onVerify={() => updateFact(f.id, { verified: "verified" })} onReject={() => updateFact(f.id, { verified: "rejected" })} onDelete={() => removeFact(f.id)} />)}
          </div>
        )}
      </section>
    </div>
  );
}

function FactRow({ fact, onVerify, onReject, onDelete }: { fact: CandidateFact; onVerify: () => void; onReject: () => void; onDelete: () => void }) {
  const val = typeof fact.value === "string" ? fact.value : JSON.stringify(fact.value);
  const vColor = fact.verified === "verified" ? "#34D399" : fact.verified === "rejected" ? "#EF4444" : "#7878A8";
  return (
    <div className="flex items-start gap-2 py-1.5 border-b border-border-default last:border-0">
      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-background-base border border-border-default text-text-muted flex-none mt-0.5">{fact.factType}</span>
      <div className="flex-1 min-w-0">
        <div className="text-sm text-text-primary break-words">{val.slice(0, 240)}</div>
        {fact.sensitivity !== "normal" && <span className="text-[10px] text-[#F0C94E] flex items-center gap-1 mt-0.5"><ShieldAlert size={10} /> {fact.sensitivity} — never used for ranking</span>}
      </div>
      <span className="text-[10px] font-mono flex-none mt-1" style={{ color: vColor }}>{fact.verified}</span>
      <div className="flex items-center gap-1 flex-none">
        <button onClick={onVerify} title="Verify" className="text-text-muted hover:text-[#34D399]"><Check size={14} /></button>
        <button onClick={onReject} title="Reject" className="text-text-muted hover:text-[#F0C94E]"><X size={14} /></button>
        <button onClick={onDelete} title="Delete" className="text-text-muted hover:text-accent-red"><Trash2 size={13} /></button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="mt-2"><label className="block text-xs text-text-secondary mb-1">{label}</label>{children}</div>;
}
const field = "w-full bg-background-base border border-border-default rounded-input px-3 py-2 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-[#4FC3F7]/50";
