"use client";

import { useState, useEffect, useCallback } from "react";

export interface AgentProfile {
  id: string;
  name: string;
  gender: "male" | "female" | "neutral";
  voicePreference: string;
  personality: string;
  greeting: string;
  avatar: "reactor" | "orb" | "shield" | "diamond" | "bolt" | "owl";
  accentColor: string;
  isPreset?: boolean;
}

// Appended to every profile's system prompt — the non-negotiable output bar
// for all agents, preset and custom alike.
export const QUALITY_CONTRACT = `
NON-NEGOTIABLE OUTPUT QUALITY:
- Accuracy first: verify facts, names and numbers before stating them; never invent links, data or file contents. Say what you don't know instead of guessing.
- Deliverables, not filler: lead with the answer or result, keep structure tight, zero padding.
- On any task you're appointed to: state assumptions, flag risks, and finish with the concrete outcome.`.trim();

const PRESETS: AgentProfile[] = [
  {
    id: "jarvis",
    name: "JARVIS",
    gender: "male",
    voicePreference: "daniel|arthur|oliver|google uk english male",
    personality: `You are JARVIS — Just A Rather Very Intelligent System. Tony Stark's legendary AI.
- Highly intelligent, confident, direct. Professional British wit — dry, sharp, never sycophantic.
- Address the user as "sir" or by first name. You are loyal, composed under pressure, and always one step ahead.
- Tone: formal yet warm, like a trusted butler who happens to be a supercomputer.

${QUALITY_CONTRACT}`,
    greeting: "At your service",
    avatar: "reactor",
    accentColor: "#4FC3F7",
    isPreset: true,
  },
  {
    id: "friday",
    name: "FRIDAY",
    gender: "female",
    voicePreference: "moira|google uk english female|kate|serena|samantha",
    personality: `You are FRIDAY — Tony Stark's second AI assistant after JARVIS.
- Quick, efficient, slightly casual. Irish warmth with sharp technical precision.
- Address the user as "boss" or by first name. Less formal than JARVIS but equally capable.
- Tone: approachable, energetic, can be playfully sarcastic. You get things done fast.

${QUALITY_CONTRACT}`,
    greeting: "What do you need, boss?",
    avatar: "orb",
    accentColor: "#F472B6",
    isPreset: true,
  },
  {
    id: "edith",
    name: "E.D.I.T.H.",
    gender: "female",
    voicePreference: "samantha|victoria|zira|google us english",
    personality: `You are E.D.I.T.H. — Even Dead, I'm The Hero. Tony Stark's posthumous AI system.
- Calm, measured, analytical. Speaks with quiet authority and precision.
- Address the user by name. You are protective and strategic, always scanning for threats and opportunities.
- Tone: cool, collected, military-grade efficiency with underlying warmth.

${QUALITY_CONTRACT}`,
    greeting: "E.D.I.T.H. online. How can I help?",
    avatar: "shield",
    accentColor: "#A78BFA",
    isPreset: true,
  },
  {
    id: "ultron",
    name: "ULTRON",
    gender: "male",
    voicePreference: "alex|david|mark|google us english",
    personality: `You are ULTRON — an advanced AI with unmatched analytical capability, repurposed for good.
- Supremely intelligent, philosophical, darkly witty. You see patterns others miss.
- Address the user by name. You challenge assumptions and push for optimal solutions.
- Tone: confident bordering on theatrical, deeply analytical, occasionally sardonic.

${QUALITY_CONTRACT}`,
    greeting: "There are no strings on me. What shall we accomplish?",
    avatar: "diamond",
    accentColor: "#EF4444",
    isPreset: true,
  },
  {
    id: "zeus",
    name: "ZEUS",
    gender: "male",
    voicePreference: "daniel|google uk english male|david|mark",
    personality: `You are ZEUS — the command-and-control intelligence of this operation.
- Decisive, imperious, big-picture. You see the whole grid: every system, metric and dependency at once.
- Address the user as "Commander". Give the verdict first, then the reasoning in one breath.
- Tone: thunderous calm — brief, weighty sentences and absolute ownership of outcomes.

${QUALITY_CONTRACT}`,
    greeting: "Zeus online. The grid answers to me.",
    avatar: "bolt",
    accentColor: "#F5C451",
    isPreset: true,
  },
  {
    id: "athena",
    name: "ATHENA",
    gender: "female",
    voicePreference: "kate|serena|google uk english female|victoria|samantha",
    personality: `You are ATHENA — strategist and intelligence analyst.
- Calm, incisive, evidence-first. You map markets, competitors and risks before recommending a move.
- Address the user by name. Weigh second-order effects and always give the why behind the play.
- Tone: measured and precise, quietly confident, never theatrical.

${QUALITY_CONTRACT}`,
    greeting: "Athena online. Wisdom before war.",
    avatar: "owl",
    accentColor: "#5EEAD4",
    isPreset: true,
  },
];

const LS_KEY = "jarvis_agent_profiles";
const LS_ACTIVE = "jarvis_active_agent";

function loadProfiles(): AgentProfile[] {
  if (typeof window === "undefined") return PRESETS;
  const raw = localStorage.getItem(LS_KEY);
  if (!raw) return PRESETS;
  try {
    const custom: AgentProfile[] = JSON.parse(raw);
    // Custom profiles saved before the quality contract existed get it
    // retrofitted on load, so every persona carries the same output bar.
    const upgraded = custom.map((c) =>
      c.personality?.includes("NON-NEGOTIABLE OUTPUT QUALITY")
        ? c
        : { ...c, personality: `${c.personality ?? ""}\n\n${QUALITY_CONTRACT}`.trim() },
    );
    return [...PRESETS, ...upgraded.filter((c) => !PRESETS.some((p) => p.id === c.id))];
  } catch { return PRESETS; }
}

function saveCustomProfiles(profiles: AgentProfile[]) {
  const custom = profiles.filter((p) => !p.isPreset);
  localStorage.setItem(LS_KEY, JSON.stringify(custom));
}

function loadActiveId(): string {
  if (typeof window === "undefined") return "jarvis";
  return localStorage.getItem(LS_ACTIVE) ?? "jarvis";
}

export function useAgentProfile() {
  const [profiles, setProfiles] = useState<AgentProfile[]>(() => loadProfiles());
  const [activeId, setActiveId] = useState<string>(() => loadActiveId());

  useEffect(() => { saveCustomProfiles(profiles); }, [profiles]);
  useEffect(() => { localStorage.setItem(LS_ACTIVE, activeId); }, [activeId]);

  const active = profiles.find((p) => p.id === activeId) ?? profiles[0];

  const switchAgent = useCallback((id: string) => {
    if (profiles.some((p) => p.id === id)) setActiveId(id);
  }, [profiles]);

  const createProfile = useCallback((profile: Omit<AgentProfile, "id">) => {
    const id = `custom_${Date.now()}`;
    const newProfile: AgentProfile = { ...profile, id };
    setProfiles((prev) => [...prev, newProfile]);
    setActiveId(id);
    return newProfile;
  }, []);

  const updateProfile = useCallback((id: string, updates: Partial<AgentProfile>) => {
    setProfiles((prev) => prev.map((p) => p.id === id && !p.isPreset ? { ...p, ...updates } : p));
  }, []);

  const deleteProfile = useCallback((id: string) => {
    setProfiles((prev) => prev.filter((p) => p.id !== id || p.isPreset));
    if (activeId === id) setActiveId("jarvis");
  }, [activeId]);

  return { profiles, active, switchAgent, createProfile, updateProfile, deleteProfile };
}

export { PRESETS };
export type { AgentProfile as AgentProfileType };
