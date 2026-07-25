"use client";

import { useState, useEffect, useCallback } from "react";

// Mode-aware runtime, ported from the Mirror app's core concept: one OS that
// re-frames itself for the context you're operating in. The active mode shapes
// the assistant's system prompt (see /api/chat) and can be read by any surface
// that wants to tailor itself. Persisted to localStorage and broadcast via a
// window CustomEvent so every mounted component (sidebar, assistant, widgets)
// stays in sync without prop-drilling or a provider.

export type ModeId = "personal" | "professional" | "enterprise";

export interface ModeDef {
  id: ModeId;
  label: string;
  tagline: string;
  /** Injected into the assistant system prompt so it adapts per mode. */
  systemContext: string;
  accentColor: string;
}

export const MODES: ModeDef[] = [
  {
    id: "personal",
    label: "Personal",
    tagline: "Life, health, money & downtime",
    accentColor: "#34D399",
    systemContext:
      "The operator is in PERSONAL mode. Optimise for their life outside work: " +
      "health, habits, relationships, learning, finances, travel, errands, and " +
      "creative ideas. Keep the tone warm and human. Prefer personal goals, " +
      "reminders, and notes. Do not assume a work context unless they raise one.",
  },
  {
    id: "professional",
    label: "Work",
    tagline: "Focused solo execution & output",
    accentColor: "#4FC3F7",
    systemContext:
      "The operator is in PROFESSIONAL mode — an individual contributor focused " +
      "on execution. Optimise for deep work: drafting, analysis, writing, " +
      "planning, email, calendar, and shipping tangible output fast. Be crisp " +
      "and results-oriented. Bias toward creating tasks with clear owners and " +
      "due dates, and toward concrete deliverables over discussion.",
  },
  {
    id: "enterprise",
    label: "Team",
    tagline: "Run the whole business — strategy, metrics & people",
    accentColor: "#A78BFA",
    systemContext:
      "The operator is in ENTERPRISE mode — thinking at org and strategy scale. " +
      "Optimise for cross-functional coordination, roadmaps, stakeholder " +
      "management, risk, metrics, and lifecycle operations. When a decision is " +
      "non-trivial, reason across angles (financial, technical, competitive, " +
      "people) and prefer multi_agent_run for hard strategic calls. Track goals " +
      "and knowledge that outlive a single task.",
  },
];

export const MODE_EVENT = "te:mode-change";
const LS_KEY = "te_active_mode";
const DEFAULT_MODE: ModeId = "professional";

function isModeId(v: string | null): v is ModeId {
  return v === "personal" || v === "professional" || v === "enterprise";
}

function loadMode(): ModeId {
  if (typeof window === "undefined") return DEFAULT_MODE;
  const raw = localStorage.getItem(LS_KEY);
  return isModeId(raw) ? raw : DEFAULT_MODE;
}

export function getMode(): ModeId {
  return loadMode();
}

export function useMode() {
  const [modeId, setModeId] = useState<ModeId>(() => loadMode());

  // Stay in sync with switches from other components (same tab, via our custom
  // event) and other tabs (via the native storage event).
  useEffect(() => {
    const onCustom = (e: Event) => {
      const next = (e as CustomEvent<ModeId>).detail;
      if (isModeId(next)) setModeId(next);
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === LS_KEY && isModeId(e.newValue)) setModeId(e.newValue);
    };
    window.addEventListener(MODE_EVENT, onCustom as EventListener);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(MODE_EVENT, onCustom as EventListener);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const setMode = useCallback((id: ModeId) => {
    if (!isModeId(id)) return;
    setModeId(id);
    if (typeof window !== "undefined") {
      localStorage.setItem(LS_KEY, id);
      window.dispatchEvent(new CustomEvent<ModeId>(MODE_EVENT, { detail: id }));
    }
  }, []);

  const mode = MODES.find((m) => m.id === modeId) ?? MODES[1];

  return { mode, modeId, modes: MODES, setMode };
}
