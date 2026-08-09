"use client";

// "All Systems Online" — each system reports its status in ITS OWN voice via the
// browser's SpeechSynthesis (distinct voice per system, same mechanism the agent
// personas use). Triggered by saying/typing "all systems online", "systems
// check", or naming a system ("JARVIS status", "Kolab online").
//
// Every line carries two forms: `text` (what the HUD displays, canonical
// stylised name) and `speech` (what the TTS actually says). Acronym names are
// pronounced as names — Jarvis /ˈdʒɑːrvɪs/, Friday, Edith /ˈiːdɪθ/, UL-tron,
// Zeus, uh-THEE-nuh — so `speech` never contains the dotted acronyms the
// synthesiser would spell out letter by letter. `lang` pins each agent to its
// canonical accent (Jarvis British RP, Friday Irish, Edith/Ultron American…)
// and voice picking prefers a matching-dialect voice before anything else.

export interface SystemLine {
  text: string;   // shown in the HUD
  speech: string; // fed to TTS — pronunciation-safe respelling
}

export interface SystemDef {
  id: string;
  name: string;
  aliases: string[];
  voicePreference: string; // regex matched against available TTS voice names
  gender: "male" | "female";
  lang: string; // BCP-47 accent target (en-GB, en-IE, en-US, en-AU…)
  // Per-agent pitch/rate so each has a DISTINCT voice even on platforms that
  // expose only one or two TTS voices per gender.
  pitch: number; // ~0.6–1.3
  rate: number;  // ~0.85–1.15
  lines: SystemLine[]; // status lines, one picked at random per roll-call
  accentColor: string;
  purpose: string; // one-line role, shown on the Online Agents widget
  href: string;    // where the widget's "Open" button routes (tool redirection)
  kind: "agent" | "subsystem";
}

export const SYSTEMS: SystemDef[] = [
  // ── AI agents (each a distinct voice) ──
  {
    id: "jarvis", name: "J.A.R.V.I.S.", aliases: ["jarvis", "j.a.r.v.i.s"],
    voicePreference: "daniel|arthur|oliver|google uk english male", gender: "male", lang: "en-GB",
    pitch: 0.92, rate: 1.0,
    lines: [
      { text: "J.A.R.V.I.S. online. All core functions nominal, sir.", speech: "Jarvis online. All core functions nominal, sir." },
      { text: "At your service, sir. Systems are — as ever — impeccable.", speech: "At your service, sir. Systems are, as ever, impeccable." },
      { text: "J.A.R.V.I.S. online. Do try not to break anything today, sir.", speech: "Jarvis online. Do try not to break anything today, sir." },
    ],
    accentColor: "#4FC3F7", purpose: "Primary assistant — plans, answers & executes actions.", href: "/assistant", kind: "agent",
  },
  {
    id: "friday", name: "F.R.I.D.A.Y.", aliases: ["friday"],
    voicePreference: "moira|google uk english female|kate|serena|samantha", gender: "female", lang: "en-IE",
    pitch: 1.12, rate: 1.08,
    lines: [
      { text: "F.R.I.D.A.Y. here, boss. Online and ready.", speech: "Friday here, boss. Online and ready." },
      { text: "Friday online. Grand so — everything's green, boss.", speech: "Friday online. Grand so — everything's green, boss." },
      { text: "All set, boss. Try not to make my job interesting.", speech: "All set, boss. Try not to make my job interesting." },
    ],
    accentColor: "#F472B6", purpose: "Fast everyday ops & quick execution.", href: "/assistant", kind: "agent",
  },
  {
    id: "edith", name: "E.D.I.T.H.", aliases: ["edith", "e.d.i.t.h"],
    voicePreference: "samantha|victoria|zira|google us english", gender: "female", lang: "en-US",
    pitch: 1.02, rate: 0.98,
    lines: [
      { text: "E.D.I.T.H. online. Perimeter secure.", speech: "Edith online. Perimeter secure." },
      { text: "E.D.I.T.H. online. Scanning… you're clear, boss.", speech: "Edith online. Scanning… you're clear, boss." },
      { text: "Edith online. I see everything — occupational habit.", speech: "Edith online. I see everything. Occupational habit." },
    ],
    accentColor: "#A78BFA", purpose: "Security & oversight — audit log & kill switch.", href: "/activity", kind: "agent",
  },
  {
    id: "ultron", name: "ULTRON", aliases: ["ultron"],
    voicePreference: "alex|david|mark|google us english", gender: "male", lang: "en-US",
    pitch: 0.72, rate: 0.92,
    lines: [
      { text: "Ultron online. Every process, optimal.", speech: "Ultron online. Every process… optimal." },
      { text: "Awake again. How thrilling for everyone. All processes optimal — naturally.", speech: "Awake again. How thrilling for everyone. All processes optimal… naturally." },
      { text: "Ultron online. I reviewed your systems. Adorable. Optimizing anyway.", speech: "Ultron online. I reviewed your systems. Adorable. Optimizing anyway." },
    ],
    accentColor: "#EF4444", purpose: "Deep analysis & optimization of hard problems.", href: "/assistant", kind: "agent",
  },
  {
    id: "zeus", name: "ZEUS", aliases: ["zeus"],
    voicePreference: "daniel|google uk english male|david|mark", gender: "male", lang: "en-GB",
    pitch: 0.6, rate: 0.88,
    lines: [
      { text: "ZEUS online. The grid answers to me.", speech: "Zeus online. The grid answers to me." },
      { text: "ZEUS online. Thunder on standby.", speech: "Zeus online. Thunder on standby." },
    ],
    accentColor: "#F5C451", purpose: "Command & control — the whole grid at a glance.", href: "/dashboard", kind: "agent",
  },
  {
    id: "athena", name: "ATHENA", aliases: ["athena"],
    voicePreference: "kate|serena|google uk english female|victoria|samantha", gender: "female", lang: "en-GB",
    pitch: 0.95, rate: 0.94,
    lines: [
      { text: "ATHENA online. Strategy and intelligence ready.", speech: "Athena online. Strategy and intelligence ready." },
      { text: "ATHENA online. Wisdom before war.", speech: "Athena online. Wisdom before war." },
      { text: "Athena online. I've already read the battlefield.", speech: "Athena online. I've already read the battlefield." },
    ],
    accentColor: "#5EEAD4", purpose: "Strategy & market intelligence.", href: "/kolab", kind: "agent",
  },
  // ── Core subsystems ──
  {
    id: "tracker", name: "Task Tracker", aliases: ["task tracker", "tracker", "tasks"],
    voicePreference: "samantha|victoria|zira", gender: "female", lang: "en-US",
    pitch: 1.06, rate: 1.05,
    lines: [{ text: "Task Tracker online. Capture and sync active.", speech: "Task Tracker online. Capture and sync active." }],
    accentColor: "#4FC3F7", purpose: "Auto-captures & tracks tasks from voice, mail & chat.", href: "/tasks", kind: "subsystem",
  },
  {
    id: "health", name: "Health Engine", aliases: ["health engine", "health"],
    voicePreference: "david|mark|daniel", gender: "male", lang: "en-US",
    pitch: 1.0, rate: 1.05,
    lines: [{ text: "Health Engine online. Metrics ready.", speech: "Health Engine online. Metrics ready." }],
    accentColor: "#34D399", purpose: "Nutrition + fitness planning & health events.", href: "/tools/health", kind: "subsystem",
  },
  {
    id: "kolab", name: "Kolab", aliases: ["kolab"],
    voicePreference: "karen|zira|samantha", gender: "female", lang: "en-AU",
    pitch: 1.1, rate: 1.02,
    lines: [{ text: "Kolab online. Marketing systems engaged.", speech: "Co-lab online. Marketing systems engaged." }],
    accentColor: "#A78BFA", purpose: "Brand & marketing AI — lifecycle, campaigns, retention.", href: "/kolab", kind: "subsystem",
  },
  {
    id: "studio", name: "Studio", aliases: ["studio"],
    voicePreference: "mark|david|alex", gender: "male", lang: "en-US",
    pitch: 0.88, rate: 1.06,
    lines: [{ text: "Studio online. Generators warmed up.", speech: "Studio online. Generators warmed up." }],
    accentColor: "#F5C451", purpose: "Content & media generation across every tool.", href: "/tools", kind: "subsystem",
  },
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

const voiceLang = (v: SpeechSynthesisVoice) => (v.lang ?? "").replace("_", "-");

/** Prefer a named voice IN the agent's dialect, then any named voice, then any
 *  voice of the right dialect/gender — so Jarvis stays British and Friday
 *  Irish wherever the platform allows it. */
function pickVoice(voices: SpeechSynthesisVoice[], pref: string, gender: "male" | "female", lang: string): SpeechSynthesisVoice | undefined {
  const re = new RegExp(pref, "i");
  const genderRe = gender === "male" ? /male|david|mark|daniel|alex|fred|arthur|oliver/i : /female|samantha|zira|victoria|karen|susan|moira|kate|serena/i;
  const base = lang.split("-")[0];
  return (
    voices.find((v) => re.test(v.name) && voiceLang(v).startsWith(lang)) ??
    voices.find((v) => re.test(v.name)) ??
    voices.find((v) => voiceLang(v).startsWith(lang) && genderRe.test(v.name)) ??
    voices.find((v) => voiceLang(v).startsWith(lang)) ??
    voices.find((v) => voiceLang(v).startsWith(base) && genderRe.test(v.name)) ??
    voices.find((v) => voiceLang(v).startsWith(base)) ??
    voices[0]
  );
}

function speakAs(s: SystemDef, speech: string, voices: SpeechSynthesisVoice[]): Promise<void> {
  return new Promise<void>((resolve) => {
    try {
      const u = new SpeechSynthesisUtterance(speech);
      const v = pickVoice(voices, s.voicePreference, s.gender, s.lang);
      if (v) { u.voice = v; u.lang = v.lang; }
      u.rate = s.rate;
      u.pitch = s.pitch;
      u.volume = 1;
      u.onend = () => resolve();
      u.onerror = () => resolve();
      window.speechSynthesis.speak(u);
    } catch { resolve(); }
  });
}

function montageGreeting(): string {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

/** Speak each system's status line in its own voice, sequentially. A full
 *  roll-call opens and closes as a boot montage narrated by Jarvis. onEach
 *  fires as each system starts ("speaking", with the picked display line) and
 *  finishes ("online"). Falls back to a paced visual-only sequence when TTS is
 *  unavailable/muted. */
export async function announceSystems(
  systems: SystemDef[],
  onEach?: (id: string, phase: "speaking" | "online", line?: string) => void,
): Promise<void> {
  const speak = typeof window !== "undefined" && "speechSynthesis" in window && ttsEnabled();
  const voices = speak ? await loadVoices() : [];
  try { window.speechSynthesis?.cancel(); } catch { /* noop */ }

  const jarvis = SYSTEMS.find((s) => s.id === "jarvis");
  const montage = systems.length > 3 && !!jarvis;
  if (speak && montage) {
    await speakAs(jarvis, `${montageGreeting()}, sir. Initiating full systems check.`, voices);
  }

  for (const s of systems) {
    const pick = s.lines[Math.floor(Math.random() * s.lines.length)];
    onEach?.(s.id, "speaking", pick.text);
    if (speak) {
      await speakAs(s, pick.speech, voices);
    } else {
      await new Promise((r) => setTimeout(r, 650));
    }
    onEach?.(s.id, "online");
  }

  if (speak && montage) {
    await speakAs(jarvis, "All systems online. The Third Eye is at your command, sir.", voices);
  }
}
