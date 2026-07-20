"use client";

// Skills = saved multi-step automations the assistant runs on command (Zoey-style
// "skills"). A skill is an ordered list of natural-language steps; running one
// composes a single instruction and hands it to the assistant, which executes
// each step with its tools — pausing for approval on anything sensitive (pay,
// email, messages) via the existing confirm-then-act flow. No new engine: it
// reuses the agent loop, so skills get every tool + guardrail for free.

export interface Skill {
  id: string;
  name: string;
  description?: string;
  steps: string[];
  createdAt: string;
  updatedAt: string;
}

const LS_KEY = "te_skills_v1";
const RUN_KEY = "te_pending_skill_run"; // handed to the assistant on navigation

export function listSkills(): Skill[] {
  try { return JSON.parse(localStorage.getItem(LS_KEY) ?? "[]"); } catch { return []; }
}

function write(skills: Skill[]) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(skills.slice(0, 200))); } catch { /* noop */ }
}

export function saveSkill(input: { id?: string; name: string; description?: string; steps: string[] }): Skill {
  const now = new Date().toISOString();
  const skills = listSkills();
  if (input.id) {
    const idx = skills.findIndex((s) => s.id === input.id);
    if (idx >= 0) {
      skills[idx] = { ...skills[idx], name: input.name, description: input.description, steps: input.steps, updatedAt: now };
      write(skills);
      return skills[idx];
    }
  }
  const skill: Skill = {
    id: crypto.randomUUID(), name: input.name, description: input.description,
    steps: input.steps, createdAt: now, updatedAt: now,
  };
  write([skill, ...skills]);
  return skill;
}

export function deleteSkill(id: string) {
  write(listSkills().filter((s) => s.id !== id));
}

/** Compose the instruction the assistant runs for a skill. */
export function composeSkillRun(skill: Skill): string {
  const steps = skill.steps.filter((s) => s.trim()).map((s, i) => `${i + 1}. ${s.trim()}`).join("\n");
  return [
    `Run my saved automation "${skill.name}".`,
    skill.description ? `Goal: ${skill.description}` : "",
    "Do these steps in order, using your tools. Pause for my approval on anything sensitive (payments, emails, messages). If a step can't be done, say so and continue with the rest.",
    "",
    steps,
  ].filter(Boolean).join("\n");
}

// Hand-off: the Skills page stashes a composed run and navigates to /assistant,
// which picks it up once and sends it (reusing the whole agent loop).
export function stashSkillRun(text: string) {
  try { sessionStorage.setItem(RUN_KEY, text); } catch { /* noop */ }
}
export function takeSkillRun(): string | null {
  try {
    const v = sessionStorage.getItem(RUN_KEY);
    if (v) sessionStorage.removeItem(RUN_KEY);
    return v;
  } catch { return null; }
}
