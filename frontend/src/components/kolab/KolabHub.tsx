"use client";

import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Loader2, Sparkles, Save, Check, Download, ChevronDown, Workflow, Megaphone, Target, HeartPulse, ExternalLink } from "lucide-react";
import { KOLAB_MODES, type BrandProfile, type KolabMode } from "@/lib/kolab/types";
import { vaultGet, vaultSet } from "@/lib/deviceVault";

const APP = "kolab";
const MODE_ICONS = { Workflow, Megaphone, Target, HeartPulse } as const;

export function KolabHub() {
  const [brand, setBrand] = useState<BrandProfile>({ name: "" });
  const [mode, setMode] = useState<KolabMode>("lifecycle");
  const [brief, setBrief] = useState("");
  const [showBrand, setShowBrand] = useState(true);
  const [out, setOut] = useState<string | null>(null);
  const [provider, setProvider] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const b = vaultGet<BrandProfile | null>(APP, "brand", null);
    if (b?.name) { setBrand(b); setShowBrand(false); }
  }, []);

  const set = (k: keyof BrandProfile) => (v: any) => setBrand((p) => ({ ...p, [k]: v }));
  function saveBrand() { vaultSet(APP, "brand", brand); setSaved(true); setTimeout(() => setSaved(false), 1500); }

  async function generate() {
    if (!brand.name.trim()) { setError("Enter a brand name first."); return; }
    setLoading(true); setError(null); setOut(null);
    vaultSet(APP, "brand", brand);
    try {
      const res = await fetch("/api/kolab/generate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, brand, brief }),
      });
      const d = await res.json();
      if (!res.ok) { setError(d.error || `HTTP ${res.status}`); return; }
      setOut(d.output); setProvider(d.provider || "");
    } catch { setError("Network error — please try again."); }
    finally { setLoading(false); }
  }

  function download() {
    if (!out) return;
    const blob = new Blob([out], { type: "text/markdown" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = `kolab-${mode}-${(brand.name || "brand").toLowerCase().replace(/\s+/g, "-")}.md`; a.click(); URL.revokeObjectURL(a.href);
  }

  return (
    <div className="space-y-5">
      {/* Brand profile */}
      <section className="rounded-card border border-border-default bg-background-surface/40 p-4 sm:p-5">
        <button onClick={() => setShowBrand((v) => !v)} className="w-full flex items-center gap-2 text-left">
          <span className="hud-label text-[#A78BFA]">Brand profile</span>
          {brand.name && <span className="text-sm text-text-primary font-medium">· {brand.name}</span>}
          <ChevronDown size={14} className={`ml-auto text-text-muted transition-transform ${showBrand ? "rotate-180" : ""}`} />
        </button>
        {showBrand && (
          <div className="mt-3 space-y-2.5">
            <p className="text-[11px] text-text-muted">Adapts everything to <em>your</em> brand — enter any company, saved on your device.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <F label="Brand name *"><input value={brand.name} onChange={(e) => set("name")(e.target.value)} className={inp} placeholder="e.g. Vahdam India (or any brand)" /></F>
              <F label="Industry"><input value={brand.industry ?? ""} onChange={(e) => set("industry")(e.target.value)} className={inp} placeholder="e.g. D2C wellness tea" /></F>
              <F label="Product / what you sell"><input value={brand.product ?? ""} onChange={(e) => set("product")(e.target.value)} className={inp} /></F>
              <F label="Target audience"><input value={brand.audience ?? ""} onChange={(e) => set("audience")(e.target.value)} className={inp} /></F>
              <F label="Positioning"><input value={brand.positioning ?? ""} onChange={(e) => set("positioning")(e.target.value)} className={inp} /></F>
              <F label="USP / differentiators"><input value={brand.usp ?? ""} onChange={(e) => set("usp")(e.target.value)} className={inp} /></F>
              <F label="Region"><input value={brand.region ?? ""} onChange={(e) => set("region")(e.target.value)} className={inp} placeholder="e.g. India, US" /></F>
              <F label="Channels"><input value={(brand.channels || []).join(", ")} onChange={(e) => set("channels")(e.target.value.split(",").map((s) => s.trim()).filter(Boolean))} className={inp} placeholder="Meta, Google, email, WhatsApp…" /></F>
              <F label="Price point"><select value={brand.pricePoint ?? ""} onChange={(e) => set("pricePoint")((e.target.value || undefined) as any)} className={inp}><option value="">—</option><option value="value">Value</option><option value="mid">Mid</option><option value="premium">Premium</option><option value="luxury">Luxury</option></select></F>
              <F label="Stage"><select value={brand.stage ?? ""} onChange={(e) => set("stage")((e.target.value || undefined) as any)} className={inp}><option value="">—</option><option value="pre-launch">Pre-launch</option><option value="early">Early</option><option value="growth">Growth</option><option value="scale">Scale</option><option value="mature">Mature</option></select></F>
            </div>
            <F label="Primary goal + KPI"><input value={brand.goals ?? ""} onChange={(e) => set("goals")(e.target.value)} className={inp} placeholder="e.g. grow repeat rate to 35%" /></F>
            <F label="Constraints / do-nots"><input value={brand.constraints ?? ""} onChange={(e) => set("constraints")(e.target.value)} className={inp} placeholder="budget, compliance, brand no-gos" /></F>
            <button onClick={saveBrand} className="flex items-center gap-1.5 px-3 py-1.5 rounded-input border border-border-default text-text-secondary hover:text-text-primary text-xs">{saved ? <Check size={13} className="text-emerald-400" /> : <Save size={13} />} {saved ? "Saved on device" : "Save brand"}</button>
          </div>
        )}
      </section>

      {/* Mode selector */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        {KOLAB_MODES.map((m) => {
          const Icon = MODE_ICONS[m.icon as keyof typeof MODE_ICONS] ?? Workflow;
          const on = mode === m.id;
          return (
            <button key={m.id} onClick={() => setMode(m.id)} className={`text-left rounded-card border p-3 transition-colors ${on ? "border-[#A78BFA] bg-[#A78BFA]/10" : "border-border-default hover:border-border-hover"}`}>
              <Icon size={16} className={on ? "text-[#A78BFA]" : "text-text-muted"} />
              <div className={`text-sm font-semibold mt-1 ${on ? "text-[#A78BFA]" : "text-text-primary"}`}>{m.label}</div>
              <div className="text-[10px] text-text-muted mt-0.5 line-clamp-2">{m.blurb}</div>
            </button>
          );
        })}
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <input value={brief} onChange={(e) => setBrief(e.target.value)} placeholder="Anything specific for this run? (optional)" className={`${inp} flex-1`} />
        <button onClick={generate} disabled={loading} className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-input bg-[#A78BFA] text-[#07070F] text-sm font-semibold hover:brightness-110 disabled:opacity-50">
          {loading ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />} Generate
        </button>
      </div>
      {error && <p className="text-xs text-accent-red">{error}</p>}

      {/* Output */}
      <div className="rounded-card border border-border-default bg-background-surface/40 p-5 min-h-[240px]">
        {!out && !loading && <div className="h-full flex flex-col items-center justify-center text-center text-text-muted py-12"><Workflow size={26} className="opacity-40 mb-3 text-[#A78BFA]" /><p className="text-sm">Fill your brand profile once, pick a mode, and Kolab generates a complete, brand-adapted marketing program.</p></div>}
        {loading && <div className="h-full flex items-center justify-center py-12"><Loader2 size={20} className="animate-spin text-[#A78BFA]" /></div>}
        {out && (
          <>
            <div className="flex items-center justify-between mb-3">
              <span className="hud-label text-[#A78BFA]">{KOLAB_MODES.find((m) => m.id === mode)?.label} {provider && <span className="text-text-muted font-normal">· via {provider}</span>}</span>
              <button onClick={download} className="flex items-center gap-1.5 text-[11px] text-text-muted hover:text-text-primary"><Download size={12} /> .md</button>
            </div>
            <div className="prose-jarvis max-w-none text-sm text-text-secondary leading-relaxed"><ReactMarkdown remarkPlugins={[remarkGfm]}>{out}</ReactMarkdown></div>
          </>
        )}
      </div>

      <a href="https://github.com/Anchit-AI-Hustle/Kolab" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-[11px] text-text-muted hover:text-text-secondary"><ExternalLink size={11} /> Kolab creator-marketplace prototype</a>
    </div>
  );
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="block text-[11px] text-text-secondary mb-1">{label}</label>{children}</div>;
}
const inp = "w-full bg-background-base border border-border-default rounded-input px-2.5 py-1.5 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-[#A78BFA]/50";
