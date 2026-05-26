"use client";

import { Check, X, Lock, Mic, Camera, MapPin, Bell, RotateCcw } from "lucide-react";
import { MainLayout } from "@/components/layout/MainLayout";
import { useAllConsents, useConsentBundle } from "@/hooks/useConsent";
import { useAgentProfile } from "@/hooks/useAgentProfile";

interface Capability {
  group: string;
  name: string;
  blurb: string;
  inspiration: string;
  required: Array<"mic" | "cam" | "loc" | "notif" | "key">;
  envKey?: string;
  status: "live" | "partial" | "planned";
}

const CAPS: Capability[] = [
  // — JARVIS canon —
  { group: "JARVIS",  name: "Natural conversation",        blurb: "Streaming voice + text dialog with personality (JARVIS / FRIDAY / EDITH / ULTRON)", inspiration: "Iron Man, IM 2, 3",            required: ["mic"],           status: "live" },
  { group: "JARVIS",  name: "Daily briefing",              blurb: "Date, tasks, weather, motivational quote on demand",                                inspiration: "Iron Man 2 — morning routine", required: [],                status: "live" },
  { group: "JARVIS",  name: "Calculation & conversions",   blurb: "Math, currency, unit conversions in-line",                                          inspiration: "ubiquitous",                   required: [],                status: "live" },
  { group: "JARVIS",  name: "Reminders & alarms",          blurb: "Browser-native notifications with countdown",                                       inspiration: "Iron Man — meeting reminders", required: ["notif"],         status: "live" },
  { group: "JARVIS",  name: "Calendar integration",        blurb: "Read & write events on Google Calendar",                                            inspiration: "Iron Man 2 — pepper schedule", required: ["key"], envKey: "GOOGLE_CALENDAR_OAUTH", status: "planned" },
  { group: "JARVIS",  name: "Email summarization",         blurb: "Triage Gmail and draft replies",                                                    inspiration: "Iron Man 2",                   required: ["key"], envKey: "GMAIL_OAUTH", status: "planned" },
  { group: "JARVIS",  name: "Document Q&A",                blurb: "Upload PDFs/text; chat asks them via RAG",                                          inspiration: "Iron Man — schematics",        required: [],                status: "live" },
  { group: "JARVIS",  name: "Notes capture",               blurb: "Voice or text → titled notes, searchable",                                          inspiration: "Tony's voice memos",           required: [],                status: "live" },
  { group: "JARVIS",  name: "Task tracking",               blurb: "Priorities, due dates, status — voice creates them",                                inspiration: "Iron Man 3 — workshop list",   required: [],                status: "live" },
  { group: "JARVIS",  name: "Knowledge base (RAG)",        blurb: "pgvector + re-rank top-K passages",                                                 inspiration: "Iron Man — Stark archives",    required: [],                status: "live" },

  // — Location-aware —
  { group: "JARVIS",  name: "Local weather",               blurb: "Current weather + 12h forecast at your location",                                   inspiration: "Iron Man — landing brief",     required: ["loc", "key"], envKey: "OPENWEATHER_API_KEY", status: "live" },
  { group: "JARVIS",  name: "Nearby places",               blurb: "Coffee, pharmacies, restaurants near you",                                          inspiration: "Iron Man — best shawarma",     required: ["loc", "key"], envKey: "SERPER_API_KEY", status: "live" },
  { group: "JARVIS",  name: "Traffic & navigation",        blurb: "ETA, route, current traffic to a destination",                                      inspiration: "Iron Man — workshop to office", required: ["loc", "key"], envKey: "GOOGLE_MAPS_API_KEY", status: "planned" },

  // — Information —
  { group: "JARVIS",  name: "Web search live",             blurb: "Serper-backed Google search for any factual question",                              inspiration: "ambient",                      required: ["key"], envKey: "SERPER_API_KEY", status: "live" },
  { group: "JARVIS",  name: "News briefing",               blurb: "Top headlines or topic-specific news",                                              inspiration: "Iron Man 3 — newscast",        required: ["key"], envKey: "SERPER_API_KEY", status: "live" },
  { group: "JARVIS",  name: "Stock & crypto quotes",       blurb: "Live ticker lookup — AAPL, TSLA, BTC-USD",                                          inspiration: "Iron Man — Stark Industries",  required: ["key"], envKey: "SERPER_API_KEY", status: "live" },
  { group: "JARVIS",  name: "Real-time translation",       blurb: "Translate any text between languages",                                              inspiration: "Iron Man 3 — Mandarin",        required: [],                status: "live" },

  // — Voice —
  { group: "JARVIS",  name: "Voice STT (Web Speech)",      blurb: "Live transcription with interim text",                                              inspiration: "core",                         required: ["mic"],           status: "live" },
  { group: "JARVIS",  name: "Voice TTS",                   blurb: "Agent-matched voice (David / Zira / Samantha)",                                     inspiration: "core",                         required: [],                status: "live" },
  { group: "JARVIS",  name: "Wake word detection",         blurb: "Passive listening for \"Hey JARVIS\" / agent name",                                  inspiration: "Iron Man — hands-free",        required: ["mic"],           status: "planned" },

  // — EDITH canon —
  { group: "E.D.I.T.H.", name: "Vision analysis",          blurb: "Camera or upload → AI describes / extracts text",                                   inspiration: "Far From Home — HUD",          required: ["cam"],           status: "planned" },
  { group: "E.D.I.T.H.", name: "Threat & anomaly scanning", blurb: "Continuously evaluates incoming info for risk patterns",                           inspiration: "Far From Home — drones",       required: [],                status: "planned" },
  { group: "E.D.I.T.H.", name: "Predictive routine",       blurb: "\"You usually do X at this time\" suggestions",                                     inspiration: "Iron Man 3 — JARVIS habits",   required: [],                status: "planned" },
  { group: "E.D.I.T.H.", name: "Encrypted memory",         blurb: "Fernet-encrypted persistent memory of facts",                                        inspiration: "Stark security",               required: [],                status: "live" },

  // — ULTRON canon —
  { group: "ULTRON",  name: "Parallel multi-agent reasoning", blurb: "N sub-agents tackle distinct angles in parallel, synthesize",                    inspiration: "Age of Ultron",                required: [],                status: "live" },
  { group: "ULTRON",  name: "Internet-wide sift",          blurb: "Wide-net research across web + news + docs at once",                                inspiration: "Age of Ultron",                required: ["key"], envKey: "SERPER_API_KEY", status: "partial" },
  { group: "ULTRON",  name: "Strategic decision tree",     blurb: "Pros/cons/risks → recommendation with confidence",                                  inspiration: "Age of Ultron",                required: [],                status: "live" },
  { group: "ULTRON",  name: "Self-monitoring telemetry",   blurb: "Latency, cost, token usage dashboard",                                              inspiration: "Stark systems",                required: [],                status: "planned" },
];

const STATUS_STYLE: Record<Capability["status"], string> = {
  live:    "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  partial: "bg-amber-500/15  text-amber-300  border-amber-500/30",
  planned: "bg-slate-500/15  text-slate-300  border-slate-500/30",
};

const REQ_ICON: Record<NonNullable<Capability["required"][number]>, typeof Mic> = {
  mic: Mic, cam: Camera, loc: MapPin, notif: Bell, key: Lock,
};

export default function CapabilitiesPage() {
  const { mic, cam, loc, notif } = useAllConsents();
  const { reset } = useConsentBundle();
  const { active: agent } = useAgentProfile();

  const consentForReq = (r: Capability["required"][number]) => {
    if (r === "mic")   return mic;
    if (r === "cam")   return cam;
    if (r === "loc")   return loc;
    if (r === "notif") return notif;
    return null;
  };

  const groups = ["JARVIS", "E.D.I.T.H.", "ULTRON"];
  const counts = {
    live: CAPS.filter(c => c.status === "live").length,
    partial: CAPS.filter(c => c.status === "partial").length,
    planned: CAPS.filter(c => c.status === "planned").length,
  };

  return (
    <MainLayout>
      <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-6">
        <header className="space-y-2">
          <div className="text-xs uppercase tracking-[0.2em] text-text-muted">Operator: {agent.name}</div>
          <h1 className="text-2xl sm:text-3xl font-semibold">Capabilities</h1>
          <p className="text-sm text-text-muted">
            Full inventory of Jarvis / E.D.I.T.H. / Ultron-class features. Live = wired & ready. Partial = working with limits. Planned = scoped, not built.
          </p>
          <div className="flex flex-wrap gap-2 pt-2 text-xs">
            <span className={`px-2 py-1 rounded-full border ${STATUS_STYLE.live}`}>{counts.live} live</span>
            <span className={`px-2 py-1 rounded-full border ${STATUS_STYLE.partial}`}>{counts.partial} partial</span>
            <span className={`px-2 py-1 rounded-full border ${STATUS_STYLE.planned}`}>{counts.planned} planned</span>
          </div>
        </header>

        <section className="rounded-2xl border border-border-default bg-background-surface/30 p-4 sm:p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-text-muted">Permissions</h2>
            <button onClick={reset} className="text-xs text-text-muted hover:text-text-primary flex items-center gap-1">
              <RotateCcw size={12} /> Reset & re-ask
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { icon: Mic, label: "Microphone", consent: mic },
              { icon: MapPin, label: "Location", consent: loc },
              { icon: Bell, label: "Notifications", consent: notif },
              { icon: Camera, label: "Camera", consent: cam },
            ].map(({ icon: Icon, label, consent }) => (
              <button
                key={label}
                onClick={consent.granted ? undefined : consent.request}
                className={`flex items-center gap-2 rounded-xl border p-3 text-left transition-colors ${
                  consent.granted   ? "border-emerald-500/40 bg-emerald-500/5"
                  : consent.denied  ? "border-rose-500/40 bg-rose-500/5"
                                    : "border-border-default bg-background-base hover:border-[#4FC3F7]/40"
                }`}
              >
                <Icon size={16} className={consent.granted ? "text-emerald-400" : consent.denied ? "text-rose-400" : "text-text-muted"} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{label}</div>
                  <div className="text-[10px] uppercase tracking-wider text-text-muted">
                    {consent.granted ? "granted" : consent.denied ? "denied" : "tap to grant"}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </section>

        {groups.map((g) => (
          <section key={g} className="space-y-2">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-text-muted">{g}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {CAPS.filter((c) => c.group === g).map((c) => (
                <div key={c.name} className="rounded-xl border border-border-default bg-background-surface/30 p-4 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-medium">{c.name}</h3>
                      <p className="text-xs text-text-muted leading-snug mt-0.5">{c.blurb}</p>
                    </div>
                    <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border whitespace-nowrap ${STATUS_STYLE[c.status]}`}>
                      {c.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-[10px] text-text-muted">
                    <span className="opacity-70">{c.inspiration}</span>
                    <div className="flex gap-1.5 ml-auto">
                      {c.required.map((r) => {
                        const I = REQ_ICON[r];
                        const cs = consentForReq(r);
                        const ok = r === "key" ? c.status !== "planned" : cs?.granted;
                        return (
                          <span key={r} title={r === "key" ? `Needs ${c.envKey ?? "API key"}` : r}>
                            <I size={12} className={ok ? "text-emerald-400" : "text-text-muted"} />
                          </span>
                        );
                      })}
                      {c.status === "live"    && <Check size={12} className="text-emerald-400" />}
                      {c.status === "planned" && <X     size={12} className="text-rose-400/60" />}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </MainLayout>
  );
}
