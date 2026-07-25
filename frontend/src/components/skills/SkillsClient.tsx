"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Workflow, Play, Plus, Trash2, Pencil, X, Check, GripVertical } from "lucide-react";
import { listSkills, saveSkill, deleteSkill, composeSkillRun, stashSkillRun, type Skill } from "@/lib/skills/store";

const STARTERS: { name: string; description: string; steps: string[] }[] = [
  { name: "Morning kickoff", description: "Start the day", steps: ["Summarise my urgent tasks and anything overdue", "Read my unread emails and flag anything needing a reply", "Give me today's calendar", "Suggest my top 3 priorities"] },
  { name: "Inbox to tasks", description: "Turn email into action", steps: ["Scan my recent unread emails", "Create tasks for anything that needs an action, with due dates", "Draft replies for the ones I just need to acknowledge"] },
  { name: "Follow-up sweep", description: "Chase open threads", steps: ["Find tasks assigned to others that are overdue", "Draft a short, polite follow-up message for each", "List them for my approval before sending"] },
];

export function SkillsClient() {
  const router = useRouter();
  const [skills, setSkills] = useState<Skill[]>([]);
  const [editing, setEditing] = useState<Skill | "new" | null>(null);

  useEffect(() => { setSkills(listSkills()); }, []);
  const refresh = () => setSkills(listSkills());

  const run = (s: Skill) => {
    stashSkillRun(composeSkillRun(s));
    router.push("/assistant");
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-text-secondary max-w-xl">
          Save multi-step automations your assistant runs on command — it executes each step with its tools and pauses for approval on anything sensitive.
        </p>
        <button onClick={() => setEditing("new")}
          className="flex-none inline-flex items-center gap-1.5 px-3 py-2 rounded-input bg-[#4FC3F7]/15 border border-[#4FC3F7]/40 text-[#4FC3F7] text-sm font-medium hover:bg-[#4FC3F7]/25 transition-colors">
          <Plus size={15} /> New skill
        </button>
      </div>

      {skills.length === 0 && editing === null && (
        <div>
          <p className="hud-label text-text-muted mb-2">Start from a template</p>
          <div className="grid gap-3 sm:grid-cols-3">
            {STARTERS.map((t) => (
              <button key={t.name} onClick={() => { saveSkill(t); refresh(); }}
                className="text-left rounded-card border border-border-default bg-background-surface p-4 hover:border-[#4FC3F7]/40 transition-colors">
                <div className="flex items-center gap-2 text-[#4FC3F7] mb-1"><Workflow size={14} /><span className="text-sm font-semibold text-text-primary">{t.name}</span></div>
                <p className="text-xs text-text-muted">{t.steps.length} steps · {t.description}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {skills.map((s) => (
          <div key={s.id} className="rounded-card border border-border-default bg-background-surface p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-[#4FC3F7]"><Workflow size={15} /><span className="text-sm font-semibold text-text-primary truncate">{s.name}</span></div>
                {s.description && <p className="text-xs text-text-muted mt-0.5">{s.description}</p>}
              </div>
              <div className="flex items-center gap-1 flex-none">
                <button onClick={() => setEditing(s)} title="Edit" className="p-1.5 rounded-input text-text-muted hover:text-text-primary"><Pencil size={13} /></button>
                <button onClick={() => { deleteSkill(s.id); refresh(); }} title="Delete" className="p-1.5 rounded-input text-text-muted hover:text-accent-red"><Trash2 size={13} /></button>
              </div>
            </div>
            <ol className="mt-3 space-y-1">
              {s.steps.filter((x) => x.trim()).map((step, i) => (
                <li key={i} className="text-xs text-text-secondary flex gap-2"><span className="text-text-muted font-mono flex-none">{i + 1}.</span><span>{step}</span></li>
              ))}
            </ol>
            <button onClick={() => run(s)}
              className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-input bg-[#34D399]/15 border border-[#34D399]/40 text-[#34D399] text-xs font-medium hover:bg-[#34D399]/25 transition-colors">
              <Play size={13} /> Run
            </button>
          </div>
        ))}
      </div>

      {editing !== null && (
        <SkillEditor
          skill={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); refresh(); }}
        />
      )}
    </div>
  );
}

function SkillEditor({ skill, onClose, onSaved }: { skill: Skill | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(skill?.name ?? "");
  const [description, setDescription] = useState(skill?.description ?? "");
  const [steps, setSteps] = useState<string[]>(skill?.steps?.length ? skill.steps : [""]);

  const setStep = (i: number, v: string) => setSteps((p) => p.map((s, idx) => idx === i ? v : s));
  const addStep = () => setSteps((p) => [...p, ""]);
  const removeStep = (i: number) => setSteps((p) => p.filter((_, idx) => idx !== i));

  const canSave = name.trim() && steps.some((s) => s.trim());
  const save = () => {
    if (!canSave) return;
    saveSkill({ id: skill?.id, name: name.trim(), description: description.trim() || undefined, steps: steps.map((s) => s.trim()).filter(Boolean) });
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-card border border-border-default bg-background-elevated p-5 space-y-4 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold text-text-primary">{skill ? "Edit skill" : "New skill"}</h2>
          <button onClick={onClose} className="p-1 text-text-muted hover:text-text-primary"><X size={16} /></button>
        </div>
        <div>
          <label className="block text-xs font-mono text-text-secondary mb-1.5">Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Morning kickoff"
            className="w-full bg-background-base border border-border-default rounded-input px-3 py-2 text-sm text-text-primary outline-none focus:border-[#4FC3F7]" />
        </div>
        <div>
          <label className="block text-xs font-mono text-text-secondary mb-1.5">What it's for (optional)</label>
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Short goal"
            className="w-full bg-background-base border border-border-default rounded-input px-3 py-2 text-sm text-text-primary outline-none focus:border-[#4FC3F7]" />
        </div>
        <div>
          <label className="block text-xs font-mono text-text-secondary mb-1.5">Steps</label>
          <div className="space-y-2">
            {steps.map((s, i) => (
              <div key={i} className="flex items-center gap-2">
                <GripVertical size={13} className="text-text-muted flex-none" />
                <span className="text-[11px] font-mono text-text-muted w-4 flex-none">{i + 1}</span>
                <input value={s} onChange={(e) => setStep(i, e.target.value)} placeholder="Describe this step in plain English"
                  className="flex-1 bg-background-base border border-border-default rounded-input px-3 py-1.5 text-sm text-text-primary outline-none focus:border-[#4FC3F7]" />
                {steps.length > 1 && <button onClick={() => removeStep(i)} className="p-1 text-text-muted hover:text-accent-red flex-none"><X size={13} /></button>}
              </div>
            ))}
          </div>
          <button onClick={addStep} className="mt-2 inline-flex items-center gap-1 text-xs text-[#4FC3F7] hover:underline"><Plus size={12} /> Add step</button>
        </div>
        <div className="flex items-center justify-end gap-2 pt-1">
          <button onClick={onClose} className="px-3 py-2 rounded-input border border-border-default text-text-secondary text-sm hover:text-text-primary">Cancel</button>
          <button onClick={save} disabled={!canSave}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-input bg-[#4FC3F7]/15 border border-[#4FC3F7]/40 text-[#4FC3F7] text-sm font-medium disabled:opacity-40">
            <Check size={14} /> Save skill
          </button>
        </div>
      </div>
    </div>
  );
}
