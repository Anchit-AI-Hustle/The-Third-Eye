"use client";

// "All Systems Online" — each system reports its status in ITS OWN voice via the
// browser's SpeechSynthesis (distinct voice per system, same mechanism the agent
// personas use). Triggered by saying/typing "all systems online", "systems
// check", or naming a system ("JARVIS status", "Kolab online").

export interface SystemDef {
  id: string;
  name: string;
  aliases: string[];
  voicePreference: string; // regex matched against available TTS voice names
  gender: "male" | "female";
  // Per-agent pitch/rate so each has a DISTINCT voice even on platforms that
  // expose only one or two TTS voices per gender.
  pitch: number; // ~0.6–1.3
  rate: number;  // ~0.85–1.15
  line: string;  // what it says when it comes online
  accentColor: string;
  purpose: string; // one-line role, shown on the Online Agents widget
  href: string;    // where the widget's "Open" button routes (tool redirection)
  kind: "agent" | "subsystem";
}

export const SYSTEMS: SystemDef[] = [
  // ── AI agents (each a distinct voice) ──
  { id: "jarvis", name: "J.A.R.V.I.S.", aliases: ["jarvis", "j.a.r.v.i.s"], voicePreference: "daniel|google uk english male|david|mark", gender: "male", pitch: 0.92, rate: 1.02, line: "J.A.R.V.I.S. online. All core functions nominal, sir.", accentColor: "#4FC3F7", purpose: "Primary assistant — plans, answers & executes actions.", href: "/assistant", kind: "agent" },
  { id: "friday", name: "F.R.I.D.A.Y.", aliases: ["friday"], voicePreference: "samantha|google us english|zira|victoria|karen", gender: "female", pitch: 1.14, rate: 1.09, line: "FRIDAY here, boss. Online and ready.", accentColor: "#F472B6", purpose: "Fast everyday ops & quick execution.", href: "/assistant", kind: "agent" },
  { id: "edith", name: "E.D.I.T.H.", aliases: ["edith", "e.d.i.t.h"], voicePreference: "karen|zira|victoria|samantha", gender: "female", pitch: 1.0, rate: 0.98, line: "E.D.I.T.H. online. Perimeter secure.", accentColor: "#A78BFA", purpose: "Security & oversight — audit log & kill switch.", href: "/activity", kind: "agent" },
  { id: "ultron", name: "ULTRON", aliases: ["ultron"], voicePreference: "google uk english male|david|mark|daniel", gender: "male", pitch: 0.8, rate: 0.97, line: "Ultron online. Every process, optimal.", accentColor: "#EF4444", purpose: "Deep analysis & optimization of hard problems.", href: "/assistant", kind: "agent" },
  { id: "zeus", name: "ZEUS", aliases: ["zeus"], voicePreference: "google uk english male|daniel|david|mark", gender: "male", pitch: 0.66, rate: 0.9, line: "Zeus online. The grid answers to me.", accentColor: "#F5C451", purpose: "Command & control — the whole grid at a glance.", href: "/dashboard", kind: "agent" },
  { id: "athena", name: "ATHENA", aliases: ["athena"], voicePreference: "victoria|karen|samantha|zira", gender: "female", pitch: 0.92, rate: 0.96, line: "Athena online. Strategy and intelligence ready.", accentColor: "#5EEAD4", purpose: "Strategy & market intelligence.", href: "/kolab", kind: "agent" },
  // ── Core subsystems ──
  { id: "tracker", name: "Task Tracker", aliases: ["task tracker", "tracker", "tasks"], voicePreference: "samantha|victoria|zira", gender: "female", pitch: 1.06, rate: 1.05, line: "Task Tracker online. Capture and sync active.", accentColor: "#4FC3F7", purpose: "Auto-captures & tracks tasks from voice, mail & chat.", href: "/tasks", kind: "subsystem" },
  { id: "health", name: "Health Engine", aliases: ["health engine", "health"], voicePreference: "david|mark|daniel", gender: "male", pitch: 1.0, rate: 1.05, line: "Health Engine online. Metrics ready.", accentColor: "#34D399", purpose: "Nutrition + fitness planning & health events.", href: "/tools/health", kind: "subsystem" },
  { id: "kolab", name: "Kolab", aliases: ["kolab"], voicePreference: "zira|karen|samantha", gender: "female", pitch: 1.1, rate: 1.02, line: "Kolab online. Marketing systems engaged.", accentColor: "#A78BFA", purpose: "Brand & marketing AI — lifecycle, campaigns, retention.", href: "/kolab", kind: "subsystem" },
  { id: "studio", name: "Studio", aliases: ["studio"], voicePreference: "mark|david|daniel", gender: "male", pitch: 0.88, rate: 1.06, line: "Studio online. Generators warmed up.", accentColor: "#F5C451", purpose: "Content & media generation across every tool.", href: "/tools", kind: "subsystem" },
];

export type SystemsTarget = { all: true } | { names: string[] } | null;

const STATUS_WORDS = ["online", "status", "report", "check", "come online", "systems go", "boot"];

/** Detect an "all systems / <system> status" command in free text. */
export function matchSystemsCommand(raw: string): SystemsTarget {
  const t = (raw || "").toLowerCase().trim();
  if (!t) return null;
  const hasStatusWord = STATUS_WORDS.some((w) => t.includes(w));

  if (
    /\ball systems\b/.test(t) || t === "systems online" || t === "systems check" || t === "status report" ||
    /\bsystems? (online|check|report|status|go)\b/.test(t) ||
    // Generic "agents" / "who's online" status queries → show everyone.
    /\bonline agents?\b/.test(t) || /\bagents?\b.*\b(online|status|report|check|list)\b/.test(t) ||
    /\b(who('?s| is)|what('?s| is)) online\b/.test(t) || /\bagent status\b/.test(t) || /\bshow (me )?(the )?agents?\b/.test(t)
  ) {
    return { all: true };
  }
  if (!hasStatusWord) return null;
  const names = SYSTEMS.filter((s) => s.aliases.some((a) => t.includes(a))).map((s) => s.id);
  return names.length ? { names } : null;
}

export function resolveSystems(target: SystemsTarget): SystemDef[] {
  if (!target) return [];
  if ("all" in target) return SYSTEMS;
  return SYSTEMS.filter((s) => target.names.includes(s.id));
}

// ── Speech ───────────────────────────────────────────────────────────────────

function ttsEnabled(): boolean {
  if (typeof window === "undefined") return false;
  const v = localStorage.getItem("jarvis_tts_enabled");
  return v === null ? true : v === "true";
}

function loadVoices(timeoutMs = 1500): Promise<SpeechSynthesisVoice[]> {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return Promise.resolve([]);
  const now = window.speechSynthesis.getVoices();
  if (now.length) return Promise.resolve(now);
  return new Promise((resolve) => {
    let done = false;
    const finish = () => { if (done) return; done = true; window.speechSynthesis.removeEventListener("voiceschanged", finish); resolve(window.speechSynthesis.getVoices()); };
    window.speechSynthesis.addEventListener("voiceschanged", finish);
    const start = Date.now();
    const tick = () => { if (window.speechSynthesis.getVoices().length || Date.now() - start > timeoutMs) finish(); else setTimeout(tick, 100); };
    tick();
  });
}

function pickVoice(voices: SpeechSynthesisVoice[], pref: string, gender: "male" | "female"): SpeechSynthesisVoice | undefined {
  const re = new RegExp(pref, "i");
  const genderRe = gender === "male" ? /male|david|mark|daniel|alex|fred|google uk english male/i : /female|samantha|zira|victoria|karen|susan|google us english/i;
  return (
    voices.find((v) => re.test(v.name)) ??
    voices.find((v) => v.lang?.startsWith("en") && genderRe.test(v.name)) ??
    voices.find((v) => v.lang === "en-US") ??
    voices.find((v) => v.lang?.startsWith("en")) ??
    voices[0]
  );
}

/** Speak each system's status line in its own voice, sequentially. onEach fires
 *  as each system starts ("speaking") and finishes ("online"). Falls back to a
 *  paced visual-only sequence when TTS is unavailable/muted. */
export async function announceSystems(
  systems: SystemDef[],
  onEach?: (id: string, phase: "speaking" | "online") => void,
): Promise<void> {
  const speak = typeof window !== "undefined" && "speechSynthesis" in window && ttsEnabled();
  const voices = speak ? await loadVoices() : [];
  try { window.speechSynthesis?.cancel(); } catch { /* noop */ }

  for (const s of systems) {
    onEach?.(s.id, "speaking");
    if (speak) {
      await new Promise<void>((resolve) => {
        try {
          const u = new SpeechSynthesisUtterance(s.line);
          const v = pickVoice(voices, s.voicePreference, s.gender);
          if (v) u.voice = v;
          u.rate = s.rate;
          u.pitch = s.pitch;
          u.volume = 1;
          u.onend = () => resolve();
          u.onerror = () => resolve();
          window.speechSynthesis.speak(u);
        } catch { resolve(); }
      });
    } else {
      await new Promise((r) => setTimeout(r, 650));
    }
    onEach?.(s.id, "online");
  }
}
