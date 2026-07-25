// Persona catalog for the 3D personas. Voice agents come straight from the
// SYSTEMS roster (so a persona exists for every agent), plus a personal
// "Operator" persona for the user themselves — the one that fronts the resume
// and represents "me" across the app.

import { SYSTEMS } from "@/lib/systems";

export interface PersonaDef {
  id: string;
  name: string;
  color: string;
  purpose: string;
}

export const OPERATOR_PERSONA: PersonaDef = {
  id: "operator",
  name: "You",
  color: "#7B5CF0",
  purpose: "Your own persona — fronts your resume and represents you across agents.",
};

/** Every voice agent (kind: "agent") as a persona, plus the operator. */
export function agentPersonas(): PersonaDef[] {
  const agents = SYSTEMS.filter((s) => s.kind === "agent").map((s) => ({
    id: s.id, name: s.name, color: s.accentColor, purpose: s.purpose,
  }));
  return [OPERATOR_PERSONA, ...agents];
}

/** Resolve a persona for an agent name/id (falls back to JARVIS' blue). */
export function personaFor(nameOrId?: string): PersonaDef {
  if (!nameOrId) return { id: "jarvis", name: "J.A.R.V.I.S.", color: "#4FC3F7", purpose: "" };
  const key = nameOrId.toLowerCase().replace(/[^a-z]/g, "");
  const hit = SYSTEMS.find((s) => s.id === key || s.name.toLowerCase().replace(/[^a-z]/g, "") === key
    || s.aliases.some((a) => a.replace(/[^a-z]/g, "") === key));
  if (hit) return { id: hit.id, name: hit.name, color: hit.accentColor, purpose: hit.purpose };
  return { id: "jarvis", name: "J.A.R.V.I.S.", color: "#4FC3F7", purpose: "" };
}
