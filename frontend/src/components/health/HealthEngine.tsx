"use client";

import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Loader2, Dumbbell, Salad, Activity, ChevronDown, Sparkles, AlertTriangle, Download } from "lucide-react";
import { computeTargets } from "@/lib/health/calc";
import type { ActivityLevel, Focus, Goal, HealthInput, Pace, Sex } from "@/lib/health/types";
import { vaultGet, vaultSet } from "@/lib/deviceVault";
import { recordSignal, personalizationContext, topValue } from "@/lib/personalization";

const APP = "health";

const GOALS: { v: Goal; label: string }[] = [{ v: "lose", label: "Lose weight" }, { v: "maintain", label: "Maintain" }, { v: "gain", label: "Gain / build muscle" }];
const FOCI: { v: Focus; label: string; icon: typeof Salad }[] = [
  { v: "nutrition", label: "Nutrition", icon: Salad }, { v: "exercise", label: "Exercise", icon: Dumbbell }, { v: "both", label: "Both", icon: Activity },
];
const ACTIVITIES: { v: ActivityLevel; label: string }[] = [
  { v: "sedentary", label: "Sedentary (desk)" }, { v: "light", label: "Light (1-3 d/wk)" }, { v: "moderate", label: "Moderate (3-5 d/wk)" },
  { v: "active", label: "Active (6-7 d/wk)" }, { v: "very_active", label: "Very active / athlete" },
];

function defaults(): HealthInput {
  return {
    goal: (topValue("health.goal") as Goal) || "lose",
    focus: (topValue("health.focus") as Focus) || "both",
    sex: "male", age: 30, heightCm: 175, weightKg: 75, activity: "moderate", pace: "steady",
  };
}

export function HealthEngine() {
  const [f, setF] = useState<HealthInput>(defaults);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [plan, setPlan] = useState<string | null>(null);
  const [provider, setProvider] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Restore last-used inputs from the device vault (learning from history).
  useEffect(() => {
    const saved = vaultGet<HealthInput | null>(APP, "lastInput", null);
    if (saved) setF((prev) => ({ ...prev, ...saved }));
  }, []);

  const set = (k: keyof HealthInput) => (v: any) => setF((p) => ({ ...p, [k]: v }));
  const targets = useMemo(() => {
    try { return computeTargets(f); } catch { return null; }
  }, [f]);

  async function generate() {
    setLoading(true); setError(null); setPlan(null);
    vaultSet(APP, "lastInput", f);
    recordSignal("health.goal", f.goal);
    recordSignal("health.focus", f.focus);
    try {
      const res = await fetch("/api/tools/health", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...f, personalization: personalizationContext() }),
      });
      const d = await res.json();
      if (!res.ok) { setError(d.error || `HTTP ${res.status}`); return; }
      setPlan(d.plan); setProvider(d.provider || "");
      if (d.warning) setError(d.warning);
    } catch { setError("Network error — your targets on the left are still accurate."); }
    finally { setLoading(false); }
  }

  function downloadPlan() {
    if (!plan) return;
    const blob = new Blob([plan], { type: "text/markdown" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = `health-plan-${new Date().toISOString().slice(0, 10)}.md`; a.click(); URL.revokeObjectURL(a.href);
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,380px)_1fr] gap-5">
      {/* Inputs */}
      <div className="space-y-3.5 self-start">
        <div className="rounded-card border border-border-default bg-background-surface/40 p-4 space-y-3.5">
          <div className="hud-label text-text-muted">Your goal</div>
          <div className="grid grid-cols-3 gap-2">
            {GOALS.map((g) => <Pill key={g.v} on={f.goal === g.v} onClick={() => set("goal")(g.v)}>{g.label}</Pill>)}
          </div>
          <div className="grid grid-cols-3 gap-2">
            {FOCI.map((x) => { const I = x.icon; return <Pill key={x.v} on={f.focus === x.v} onClick={() => set("focus")(x.v)}><I size={13} className="inline mr-1" />{x.label}</Pill>; })}
          </div>

          <div className="hud-label text-text-muted pt-1">Basics (required)</div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Sex"><select value={f.sex} onChange={(e) => set("sex")(e.target.value as Sex)} className={inp}><option value="male">Male</option><option value="female">Female</option></select></Field>
            <Field label="Age"><input type="number" value={f.age} onChange={(e) => set("age")(Number(e.target.value))} className={inp} /></Field>
            <Field label="Height (cm)"><input type="number" value={f.heightCm} onChange={(e) => set("heightCm")(Number(e.target.value))} className={inp} /></Field>
            <Field label="Weight (kg)"><input type="number" value={f.weightKg} onChange={(e) => set("weightKg")(Number(e.target.value))} className={inp} /></Field>
          </div>
          <Field label="Activity level"><select value={f.activity} onChange={(e) => set("activity")(e.target.value as ActivityLevel)} className={inp}>{ACTIVITIES.map((a) => <option key={a.v} value={a.v}>{a.label}</option>)}</select></Field>

          <button onClick={() => setShowAdvanced((v) => !v)} className="text-xs text-text-muted hover:text-text-secondary flex items-center gap-1"><ChevronDown size={13} className={showAdvanced ? "rotate-180 transition-transform" : "transition-transform"} /> Fine-tune (optional)</button>
          {showAdvanced && (
            <div className="space-y-2 pt-1">
              <div className="grid grid-cols-2 gap-2">
                {f.goal !== "maintain" && <Field label="Target weight (kg)"><input type="number" value={f.targetWeightKg ?? ""} onChange={(e) => set("targetWeightKg")(e.target.value ? Number(e.target.value) : undefined)} className={inp} /></Field>}
                {f.goal !== "maintain" && <Field label="Pace"><select value={f.pace} onChange={(e) => set("pace")(e.target.value as Pace)} className={inp}><option value="relaxed">Relaxed</option><option value="steady">Steady</option><option value="aggressive">Aggressive</option></select></Field>}
              </div>
              {(f.focus === "nutrition" || f.focus === "both") && <>
                <Field label="Dietary preference"><input value={f.dietaryPreference ?? ""} onChange={(e) => set("dietaryPreference")(e.target.value)} placeholder="veg, vegan, keto, jain, halal…" className={inp} /></Field>
                <Field label="Allergies (comma-sep)"><input value={(f.allergies || []).join(", ")} onChange={(e) => set("allergies")(e.target.value.split(",").map((s) => s.trim()).filter(Boolean))} className={inp} /></Field>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Cuisine"><input value={f.cuisine ?? ""} onChange={(e) => set("cuisine")(e.target.value)} placeholder="e.g. North Indian" className={inp} /></Field>
                  <Field label="Meals/day"><input type="number" value={f.mealsPerDay ?? ""} onChange={(e) => set("mealsPerDay")(e.target.value ? Number(e.target.value) : undefined)} className={inp} /></Field>
                </div>
              </>}
              {(f.focus === "exercise" || f.focus === "both") && <>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Training days/wk"><input type="number" value={f.trainingDaysPerWeek ?? ""} onChange={(e) => set("trainingDaysPerWeek")(e.target.value ? Number(e.target.value) : undefined)} className={inp} /></Field>
                  <Field label="Session (min)"><input type="number" value={f.sessionMinutes ?? ""} onChange={(e) => set("sessionMinutes")(e.target.value ? Number(e.target.value) : undefined)} className={inp} /></Field>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Experience"><select value={f.experience ?? ""} onChange={(e) => set("experience")((e.target.value || undefined) as any)} className={inp}><option value="">—</option><option value="beginner">Beginner</option><option value="intermediate">Intermediate</option><option value="advanced">Advanced</option></select></Field>
                  <Field label="Equipment"><input value={f.equipment ?? ""} onChange={(e) => set("equipment")(e.target.value)} placeholder="home / gym / bodyweight" className={inp} /></Field>
                </div>
                <Field label="Injuries / cautions"><input value={f.injuries ?? ""} onChange={(e) => set("injuries")(e.target.value)} className={inp} /></Field>
              </>}
              <Field label="Medical conditions"><input value={f.conditions ?? ""} onChange={(e) => set("conditions")(e.target.value)} placeholder="e.g. diabetes, PCOS — planned cautiously" className={inp} /></Field>
            </div>
          )}

          <button onClick={generate} disabled={loading} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-input bg-[#34D399] text-[#07070F] text-sm font-semibold hover:brightness-110 disabled:opacity-50">
            {loading ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />} {loading ? "Building your plan…" : "Generate my plan"}
          </button>
          {error && <p className="text-xs text-[#F0C94E] flex items-start gap-1.5"><AlertTriangle size={12} className="mt-0.5 flex-none" />{error}</p>}
        </div>
      </div>

      {/* Targets + plan */}
      <div className="space-y-4">
        {targets && (
          <div className="rounded-card border border-border-default bg-background-surface/40 p-4">
            <div className="hud-label text-[#34D399] mb-3">Your daily targets (computed, exact)</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Stat label="Calories" value={`${targets.goalCalories}`} sub={`${targets.dailyDeltaKcal >= 0 ? "+" : ""}${targets.dailyDeltaKcal} vs maint.`} color="#34D399" />
              <Stat label="Protein" value={`${targets.macros.proteinG}g`} sub={`${targets.proteinPerKg} g/kg`} color="#4FC3F7" />
              <Stat label="Fat" value={`${targets.macros.fatG}g`} color="#F0C94E" />
              <Stat label="Carbs" value={`${targets.macros.carbsG}g`} color="#A78BFA" />
              <Stat label="BMR" value={`${targets.bmr}`} />
              <Stat label="TDEE" value={`${targets.tdee}`} />
              <Stat label="BMI" value={`${targets.bmi}`} sub={targets.bmiCategory} />
              <Stat label="Water" value={`${(targets.waterMl / 1000).toFixed(1)}L`} />
            </div>
            <div className="mt-3 text-[11px] text-text-muted">
              Healthy weight for your height: {targets.healthyWeightRangeKg[0]}–{targets.healthyWeightRangeKg[1]} kg{targets.estWeeklyChangeKg ? ` · ~${Math.abs(targets.estWeeklyChangeKg)} kg/week` : ""}{targets.etaWeeks ? ` · ~${targets.etaWeeks} weeks to target` : ""}
            </div>
            {targets.warnings.length > 0 && <div className="mt-2 text-[11px] text-[#F0C94E]">{targets.warnings.map((w, i) => <div key={i}>• {w}</div>)}</div>}
          </div>
        )}

        <div className="rounded-card border border-border-default bg-background-surface/40 p-5 min-h-[240px]">
          {!plan && !loading && <div className="h-full flex flex-col items-center justify-center text-center text-text-muted py-12"><Activity size={26} className="opacity-40 mb-3 text-[#34D399]" /><p className="text-sm">Your targets update live as you type. Hit “Generate my plan” for a tailored nutrition &amp; training plan built to those exact numbers.</p></div>}
          {loading && <div className="h-full flex items-center justify-center py-12"><Loader2 size={20} className="animate-spin text-[#34D399]" /></div>}
          {plan && (
            <>
              <div className="flex items-center justify-between mb-3">
                <span className="hud-label text-[#34D399]">Your plan {provider && <span className="text-text-muted font-normal">· via {provider}</span>}</span>
                <button onClick={downloadPlan} className="flex items-center gap-1.5 text-[11px] text-text-muted hover:text-text-primary"><Download size={12} /> .md</button>
              </div>
              <div className="prose-jarvis max-w-none text-sm text-text-secondary leading-relaxed"><ReactMarkdown remarkPlugins={[remarkGfm]}>{plan}</ReactMarkdown></div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Pill({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} className={`px-2.5 py-2 rounded-input border text-xs font-medium transition-colors ${on ? "border-[#34D399] text-[#34D399] bg-[#34D399]/10" : "border-border-default text-text-muted hover:text-text-secondary"}`}>{children}</button>;
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="block text-[11px] text-text-secondary mb-1">{label}</label>{children}</div>;
}
function Stat({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return <div><div className="text-lg font-bold" style={{ color: color || "var(--text-primary)" }}>{value}</div><div className="text-[10px] font-mono text-text-muted uppercase">{label}</div>{sub && <div className="text-[10px] text-text-muted">{sub}</div>}</div>;
}
const inp = "w-full bg-background-base border border-border-default rounded-input px-2.5 py-1.5 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-[#34D399]/50";
