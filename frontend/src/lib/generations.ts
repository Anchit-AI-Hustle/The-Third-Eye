"use client";

import { vaultGet, vaultSet } from "@/lib/deviceVault";
import { logAgentAction } from "@/lib/agentControl";
import { STUDIO_TOOLS } from "@/lib/studioTools";
import { dataDelete, dataInsert, dataRead } from "@/lib/dataClient";

// Unified generations log. Every app that produces an output records it here, so
// the /generations dashboard can list every input→output across the whole app
// and open a detail page for the full view. Kept on this device (device vault)
// and in the account (/api/data/generations), so outputs made on another device,
// in the phone apps or by the assistant show too.

export type GenKind = "text" | "markdown" | "html" | "audio" | "video" | "json";

export interface GenInputField { label: string; value: string }

export interface GenerationRecord {
  id: string;
  app: string;        // stable app id, e.g. "studio", "kolab", "music"
  tool?: string;      // the Studio feature that made it (its /tools/<id>), for that feature's own history
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
  avatar: { label: "Video Avatar", color: "#F97316", icon: "Video" },
  video: { label: "Video Studio", color: "#F0C94E", icon: "Clapperboard" },
  jobagent: { label: "Job Agent", color: "#F5C451", icon: "Briefcase" },
  health: { label: "Health", color: "#F472B6", icon: "HeartPulse" },
  assistant: { label: "Assistant", color: "#5EEAD4", icon: "MessageSquare" },
  book: { label: "Book Studio", color: "#F0C94E", icon: "BookOpen" },
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

// Larger outputs (an inline video or song) stay on this device only.
const ROW_OUTPUT_MAX = 1_500_000;

interface GenerationRow {
  id: string; app: string; tool?: string | null; app_label: string; title: string; kind: GenKind;
  inputs?: GenInputField[]; input_text?: string | null; output?: string; meta?: Record<string, unknown> | null; created_at: string;
}

/** The account's copy of a record. A blob: URL only means something in the browser that made it. */
export function toRow(g: GenerationRecord): GenerationRow {
  const keep = !g.output.startsWith("blob:") && g.output.length <= ROW_OUTPUT_MAX;
  return {
    id: g.id, app: g.app, tool: g.tool ?? null, app_label: g.appLabel, title: g.title, kind: g.kind,
    inputs: g.inputs, input_text: g.inputText ?? null, output: keep ? g.output : "", meta: g.meta ?? null, created_at: g.createdAt,
  };
}

function fromRow(r: GenerationRow): GenerationRecord {
  return {
    id: r.id, app: r.app, tool: r.tool ?? undefined, appLabel: r.app_label, title: r.title, kind: r.kind,
    createdAt: r.created_at, inputs: r.inputs ?? [], inputText: r.input_text ?? undefined, output: r.output ?? "", meta: r.meta ?? undefined,
  };
}

interface TrackRow { id: string; title?: string | null; description?: string | null; lyrics?: string | null; audio_url?: string | null; created_at: string }

// Music Studio saves every song to the library, from the website and the phone apps.
function fromTrack(t: TrackRow): GenerationRecord {
  return {
    id: `music_${t.id}`, app: "music", appLabel: "Music Studio", title: t.title || "Track", kind: "audio", createdAt: t.created_at,
    inputs: [], inputText: t.description ?? undefined, output: t.audio_url ?? "", meta: t.lyrics ? { lyrics: t.lyrics } : undefined,
  };
}

/** This device's records, the account's, and the music library, newest first, once each. */
export async function listAllGenerations(): Promise<GenerationRecord[]> {
  const [cloud, tracks] = await Promise.all([dataRead<GenerationRow>("generations"), dataRead<TrackRow>("music_tracks")]);
  const all = new Map<string, GenerationRecord>();
  for (const g of listGenerations()) all.set(g.id, g);
  for (const r of cloud ?? []) if (!all.has(r.id)) all.set(r.id, fromRow(r));
  // A song recorded as a generation is in the library too; account rows are listed without their output, so match by title as well.
  const songs = [...all.values()].filter((g) => g.app === "music");
  const listed = (t: TrackRow) => songs.some((g) => g.output === t.audio_url || (!!t.title && g.title === t.title));
  for (const t of tracks ?? []) if (t.audio_url && !listed(t) && !all.has(`music_${t.id}`)) all.set(`music_${t.id}`, fromTrack(t));
  return [...all.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** One record: from this device, else the account, else the music library. */
export async function getGenerationAnywhere(id: string): Promise<GenerationRecord | null> {
  const local = getGeneration(id);
  if (local) return local;
  if (id.startsWith("music_")) {
    const t = (await dataRead<TrackRow>("music_tracks"))?.find((r) => `music_${r.id}` === id);
    return t ? fromTrack(t) : null;
  }
  const row = (await dataRead<GenerationRow>(`generations?id=${encodeURIComponent(id)}`))?.[0];
  return row ? fromRow(row) : null;
}

/** Record a generation. Returns the new id. Safe to call fire-and-forget. */
export function recordGeneration(rec: Omit<GenerationRecord, "id" | "createdAt">): string {
  if (typeof window === "undefined") return "";
  const full: GenerationRecord = { ...rec, id: genId(), createdAt: new Date().toISOString() };
  const next = [full, ...listGenerations()].slice(0, CAP);
  vaultSet(APP, KEY, next);
  void dataInsert("generations", toRow(full));
  // Surface every generation in the Agent Activity feed too.
  try { logAgentAction({ type: `generate.${full.app}`, label: `${full.appLabel}: ${full.title}`, outcome: "applied" }); } catch { /* noop */ }
  try { window.dispatchEvent(new CustomEvent("te:generations-updated")); } catch { /* noop */ }
  return full.id;
}

/**
 * Which Studio feature a record belongs to. Records made before `tool` was
 * kept are matched the way they were labelled: a Studio tool by its label
 * ("Studio · Ad Copy Studio"), the others by their app id.
 */
export function featureOf(g: GenerationRecord): string {
  if (g.tool) return g.tool;
  if (g.app === "studio") return STUDIO_TOOLS.find((t) => g.appLabel === `Studio · ${t.label}`)?.id ?? "studio";
  return g.app;
}

/** One feature's own history, newest first. */
export function featureHistory(tool: string): GenerationRecord[] {
  return listGenerations().filter((g) => featureOf(g) === tool);
}

export function deleteGeneration(id: string): void {
  vaultSet(APP, KEY, listGenerations().filter((g) => g.id !== id));
  if (id.startsWith("music_")) void dataDelete("music_tracks", id.slice("music_".length));
  else void dataDelete("generations", id);
  try { window.dispatchEvent(new CustomEvent("te:generations-updated")); } catch { /* noop */ }
}

export function timeAgo(iso: string): string {
  const d = Date.now() - new Date(iso).getTime();
  const m = Math.floor(d / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/** Convenience: turn a Record<string,string> of inputs into GenInputField[]. */
export function fieldsFrom(inputs: Record<string, unknown>, labels?: Record<string, string>): GenInputField[] {
  return Object.entries(inputs)
    .filter(([, v]) => v != null && String(v).trim() !== "")
    .map(([k, v]) => ({ label: labels?.[k] ?? k, value: Array.isArray(v) ? v.join(", ") : String(v) }));
}
