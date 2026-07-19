"use client";

import { vaultGet, vaultSet } from "@/lib/deviceVault";

// Unified generations log. Every app that produces an output records it here, so
// the /generations dashboard can list every input→output across the whole app
// and open a detail page for the full view. Stored on-device (device vault).

export type GenKind = "text" | "markdown" | "html" | "audio" | "json";

export interface GenInputField { label: string; value: string }

export interface GenerationRecord {
  id: string;
  app: string;        // stable app id, e.g. "studio", "kolab", "music"
  appLabel: string;   // human label, e.g. "Studio · Ad Copy"
  title: string;      // short title for the card
  kind: GenKind;      // how `output` should be rendered
  createdAt: string;
  inputs: GenInputField[]; // structured inputs
  inputText?: string;      // freeform brief/description
  output: string;          // text/markdown/html, or an audio URL
  meta?: Record<string, unknown>; // provider, model, lyrics, tags…
}

const APP = "generations";
const KEY = "records";
const CAP = 500;

export const GEN_APPS: Record<string, { label: string; color: string; icon: string }> = {
  studio: { label: "Studio", color: "#4FC3F7", icon: "Wand2" },
  music: { label: "Music", color: "#34D399", icon: "Music" },
  kolab: { label: "Kolab", color: "#A78BFA", icon: "Workflow" },
  jobagent: { label: "Job Agent", color: "#F5C451", icon: "Briefcase" },
  health: { label: "Health", color: "#F472B6", icon: "HeartPulse" },
  assistant: { label: "Assistant", color: "#5EEAD4", icon: "MessageSquare" },
};

let _seq = 0;
function genId(): string {
  _seq += 1;
  const rand = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID().slice(0, 8) : Math.abs(hashStr(String(_seq))).toString(36);
  return `gen_${rand}${_seq}`;
}
function hashStr(s: string): number { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; }

export function listGenerations(): GenerationRecord[] {
  return vaultGet<GenerationRecord[]>(APP, KEY, []);
}

export function getGeneration(id: string): GenerationRecord | null {
  return listGenerations().find((g) => g.id === id) ?? null;
}

/** Record a generation. Returns the new id. Safe to call fire-and-forget. */
export function recordGeneration(rec: Omit<GenerationRecord, "id" | "createdAt">): string {
  if (typeof window === "undefined") return "";
  const full: GenerationRecord = { ...rec, id: genId(), createdAt: new Date().toISOString() };
  const next = [full, ...listGenerations()].slice(0, CAP);
  vaultSet(APP, KEY, next);
  try { window.dispatchEvent(new CustomEvent("te:generations-updated")); } catch { /* noop */ }
  return full.id;
}

export function deleteGeneration(id: string): void {
  vaultSet(APP, KEY, listGenerations().filter((g) => g.id !== id));
  try { window.dispatchEvent(new CustomEvent("te:generations-updated")); } catch { /* noop */ }
}

/** Convenience: turn a Record<string,string> of inputs into GenInputField[]. */
export function fieldsFrom(inputs: Record<string, unknown>, labels?: Record<string, string>): GenInputField[] {
  return Object.entries(inputs)
    .filter(([, v]) => v != null && String(v).trim() !== "")
    .map(([k, v]) => ({ label: labels?.[k] ?? k, value: Array.isArray(v) ? v.join(", ") : String(v) }));
}
