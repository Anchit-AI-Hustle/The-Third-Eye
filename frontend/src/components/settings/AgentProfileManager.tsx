"use client";

import { useState } from "react";
import { Check, Plus, Trash2, X, Cpu, Shield, Gem, Circle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAgentProfile, type AgentProfile } from "@/hooks/useAgentProfile";

const AVATARS: { id: AgentProfile["avatar"]; icon: typeof Cpu; label: string }[] = [
  { id: "reactor", icon: Cpu, label: "Reactor" },
  { id: "orb", icon: Circle, label: "Orb" },
  { id: "shield", icon: Shield, label: "Shield" },
  { id: "diamond", icon: Gem, label: "Diamond" },
];

const GENDERS: { id: AgentProfile["gender"]; label: string }[] = [
  { id: "male", label: "Male" },
  { id: "female", label: "Female" },
  { id: "neutral", label: "Neutral" },
];

const emptyForm = (): Omit<AgentProfile, "id"> => ({
  name: "",
  gender: "male",
  voicePreference: "",
  personality: "",
  greeting: "",
  avatar: "reactor",
  accentColor: "#4FC3F7",
});

export function AgentProfileManager() {
  const { profiles, active, switchAgent, createProfile, updateProfile, deleteProfile } = useAgentProfile();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(emptyForm());

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    const p = form.personality.trim() || `You are ${form.name}. You are a helpful, intelligent AI assistant. Be direct and efficient.`;
    createProfile({ ...form, personality: p, greeting: form.greeting || `${form.name} online.` });
    setForm(emptyForm());
    setShowCreate(false);
  }

  return (
    <div className="space-y-4">
      {/* Active agent */}
      <div className="holo-card rounded-card p-4 flex items-center gap-4">
        <AgentIcon avatar={active.avatar} color={active.accentColor} size={48} />
        <div className="flex-1">
          <p className="text-text-primary font-semibold">{active.name}</p>
          <p className="text-text-muted text-xs font-mono mt-0.5">{active.gender} · {active.greeting}</p>
        </div>
        <span className="flex items-center gap-1.5 text-success text-xs font-mono">
          <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" /> Active
        </span>
      </div>

      {/* All profiles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {profiles.map((p) => (
          <button
            key={p.id}
            onClick={() => switchAgent(p.id)}
            className={cn(
              "flex items-center gap-3 px-4 py-3 rounded-card border transition-all text-left",
              p.id === active.id
                ? "border-[rgba(79,195,247,0.3)] bg-[rgba(79,195,247,0.05)]"
                : "border-border-default bg-background-surface hover:border-border-hover"
            )}
          >
            <AgentIcon avatar={p.avatar} color={p.accentColor} size={32} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-text-primary">{p.name}</span>
                {p.isPreset && <span className="text-[9px] font-mono text-text-muted px-1.5 py-0.5 rounded bg-background-elevated">preset</span>}
              </div>
              <span className="text-xs text-text-muted">{p.gender} · {p.greeting.slice(0, 30)}</span>
            </div>
            {p.id === active.id && <Check size={14} className="text-success flex-none" />}
            {!p.isPreset && p.id !== active.id && (
              <button
                onClick={(e) => { e.stopPropagation(); deleteProfile(p.id); }}
                className="text-text-muted hover:text-accent-red flex-none p-1 transition-colors"
              >
                <Trash2 size={12} />
              </button>
            )}
          </button>
        ))}
      </div>

      {/* Create new */}
      {!showCreate ? (
        <button
          onClick={() => setShowCreate(true)}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-card border border-dashed border-border-default text-text-muted hover:text-[#4FC3F7] hover:border-[#4FC3F7]/30 transition-colors text-sm"
        >
          <Plus size={14} /> Create custom agent
        </button>
      ) : (
        <form onSubmit={handleCreate} className="holo-card rounded-card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <span className="hud-label text-[#4FC3F7]">New Agent</span>
            <button type="button" onClick={() => setShowCreate(false)} className="text-text-muted hover:text-text-secondary">
              <X size={14} />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Name" required>
              <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. ARIA" className="input-field" />
            </Field>
            <Field label="Gender">
              <div className="flex gap-2">
                {GENDERS.map((g) => (
                  <button key={g.id} type="button" onClick={() => setForm((f) => ({ ...f, gender: g.id }))}
                    className={cn("flex-1 px-2 py-1.5 rounded-input text-xs font-mono border transition-colors",
                      form.gender === g.id ? "border-[#4FC3F7]/40 bg-[#4FC3F7]/10 text-[#4FC3F7]" : "border-border-default text-text-muted")}>
                    {g.label}
                  </button>
                ))}
              </div>
            </Field>
          </div>

          <Field label="Greeting">
            <input value={form.greeting} onChange={(e) => setForm((f) => ({ ...f, greeting: e.target.value }))}
              placeholder="e.g. ARIA online. Ready to assist." className="input-field" />
          </Field>

          <Field label="Personality prompt">
            <textarea value={form.personality} onChange={(e) => setForm((f) => ({ ...f, personality: e.target.value }))}
              placeholder="Describe how this agent should behave, their tone, style, and character..."
              rows={3} className="input-field resize-none" />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Avatar">
              <div className="flex gap-2">
                {AVATARS.map((a) => (
                  <button key={a.id} type="button" onClick={() => setForm((f) => ({ ...f, avatar: a.id }))}
                    className={cn("p-2 rounded-input border transition-colors",
                      form.avatar === a.id ? "border-[#4FC3F7]/40 bg-[#4FC3F7]/10" : "border-border-default")}>
                    <a.icon size={14} className={form.avatar === a.id ? "text-[#4FC3F7]" : "text-text-muted"} />
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Accent color">
              <input type="color" value={form.accentColor} onChange={(e) => setForm((f) => ({ ...f, accentColor: e.target.value }))}
                className="w-8 h-8 rounded cursor-pointer bg-transparent border-none" />
            </Field>
          </div>

          <Field label="Voice preference (regex)">
            <input value={form.voicePreference} onChange={(e) => setForm((f) => ({ ...f, voicePreference: e.target.value }))}
              placeholder="e.g. zira|samantha|google.*female" className="input-field" />
          </Field>

          <button type="submit" disabled={!form.name.trim()}
            className="w-full py-2.5 rounded-input bg-[#4FC3F7] text-white text-sm font-medium hover:bg-[#4FC3F7]/90 disabled:opacity-40 transition-colors">
            Create Agent
          </button>
        </form>
      )}

      <style jsx>{`
        .input-field {
          width: 100%;
          background: var(--color-bg-elevated);
          border: 1px solid var(--color-border);
          border-radius: 4px;
          padding: 6px 10px;
          font-size: 13px;
          color: var(--color-text-primary);
          outline: none;
          font-family: inherit;
        }
        .input-field:focus { border-color: rgba(79,195,247,0.4); }
        .input-field::placeholder { color: var(--color-text-muted); }
      `}</style>
    </div>
  );
}

function Field({ label, children, required }: { label: string; children: React.ReactNode; required?: boolean }) {
  return (
    <div>
      <label className="text-xs text-text-muted mb-1 block font-mono">
        {label} {required && <span className="text-accent-red">*</span>}
      </label>
      {children}
    </div>
  );
}

function AgentIcon({ avatar, color, size }: { avatar: AgentProfile["avatar"]; color: string; size: number }) {
  const Icon = AVATARS.find((a) => a.id === avatar)?.icon ?? Cpu;
  const s = size * 0.4;
  return (
    <div className="rounded-full flex items-center justify-center flex-none"
      style={{ width: size, height: size, background: `${color}15`, border: `1.5px solid ${color}30` }}>
      <Icon size={s} style={{ color }} />
    </div>
  );
}
