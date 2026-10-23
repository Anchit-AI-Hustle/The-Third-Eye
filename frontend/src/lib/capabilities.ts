import type { LucideIcon } from "lucide-react";
import { Code, Search, Music, Shield, HeartPulse, Home, Lightbulb, FileText, Phone, Calendar, Brain } from "lucide-react";
import type { BRAND_LOGOS } from "@/components/BrandLogos";

export interface Capability {
  group: string;
  name: string;
  blurb: string;
  inspiration: string;
  required: Array<"mic" | "cam" | "loc" | "notif" | "key">;
  envKey?: string;
  status: "live" | "partial" | "planned";
  premium?: boolean;
  logo?: keyof typeof BRAND_LOGOS;
  icon?: LucideIcon;
}

export const CAPS: Capability[] = [
  // — JARVIS canon —
  { group: "JARVIS",  name: "Natural conversation",        blurb: "Streaming voice + text dialog with personality (JARVIS / FRIDAY / EDITH / ULTRON)", inspiration: "Iron Man, IM 2, 3",            required: ["mic"],           status: "live" },
  { group: "JARVIS",  name: "Daily briefing",              blurb: "Date, tasks, weather, motivational quote on demand",                                inspiration: "Iron Man 2 - morning routine", required: [],                status: "live", premium: true },
  { group: "JARVIS",  name: "Calculation & conversions",   blurb: "Math, currency, unit conversions in-line",                                          inspiration: "ubiquitous",                   required: [],                status: "live" },
  { group: "JARVIS",  name: "Reminders & alarms",          blurb: "Browser-native notifications with countdown",                                       inspiration: "Iron Man - meeting reminders", required: ["notif"],         status: "live", premium: true },
  { group: "JARVIS",  name: "Calendar integration",        blurb: "Read & write events on Google Calendar",                                            inspiration: "Iron Man 2 - pepper schedule", required: ["key"], envKey: "GOOGLE_CALENDAR_OAUTH", status: "live", premium: true, logo: "gcal" },
  { group: "JARVIS",  name: "Email summarization",         blurb: "Triage Gmail and draft replies",                                                    inspiration: "Iron Man 2",                   required: ["key"], envKey: "GMAIL_OAUTH", status: "live", premium: true, logo: "gmail" },
  { group: "JARVIS",  name: "Document Q&A",                blurb: "Upload text docs; chat searches them (keyword now; embeddings in progress)",         inspiration: "Iron Man - schematics",        required: [],                status: "partial" },
  { group: "JARVIS",  name: "Notes capture",               blurb: "Voice or text → titled notes, searchable",                                          inspiration: "Tony's voice memos",           required: [],                status: "live" },
  { group: "JARVIS",  name: "Task tracking",               blurb: "Priorities, due dates, status - voice creates them",                                inspiration: "Iron Man 3 - workshop list",   required: [],                status: "live" },
  { group: "JARVIS",  name: "Knowledge base",              blurb: "Keyword search over your docs today; pgvector embeddings are being wired up",       inspiration: "Iron Man - Stark archives",    required: [],                status: "partial" },

  // — Location-aware —
  { group: "JARVIS",  name: "Local weather",               blurb: "Current weather + 12h forecast at your location",                                   inspiration: "Iron Man - landing brief",     required: ["loc", "key"], envKey: "OPENWEATHER_API_KEY", status: "live" },
  { group: "JARVIS",  name: "Nearby places",               blurb: "Coffee, pharmacies, restaurants near you",                                          inspiration: "Iron Man - best shawarma",     required: ["loc", "key"], envKey: "SERPER_API_KEY", status: "live" },
  { group: "JARVIS",  name: "Traffic & navigation",        blurb: "ETA, route, current traffic to a destination",                                      inspiration: "Iron Man - workshop to office", required: ["loc", "key"], envKey: "GOOGLE_MAPS_API_KEY", status: "planned" },

  // — Information —
  { group: "JARVIS",  name: "Web search live",             blurb: "Serper-backed Google search for any factual question",                              inspiration: "ambient",                      required: ["key"], envKey: "SERPER_API_KEY", status: "live", logo: "google" },
  { group: "JARVIS",  name: "News briefing",               blurb: "Top headlines or topic-specific news",                                              inspiration: "Iron Man 3 - newscast",        required: ["key"], envKey: "SERPER_API_KEY", status: "live" },
  { group: "JARVIS",  name: "Stock & crypto quotes",       blurb: "Live ticker lookup - AAPL, TSLA, BTC-USD",                                          inspiration: "Iron Man - Stark Industries",  required: ["key"], envKey: "SERPER_API_KEY", status: "live" },
  { group: "JARVIS",  name: "Real-time translation",       blurb: "Translate any text between languages",                                              inspiration: "Iron Man 3 - Mandarin",        required: [],                status: "live" },

  // — Voice —
  { group: "JARVIS",  name: "Voice STT (Web Speech)",      blurb: "Live transcription with interim text",                                              inspiration: "core",                         required: ["mic"],           status: "live" },
  { group: "JARVIS",  name: "Voice TTS",                   blurb: "Agent-matched voice (David / Zira / Samantha)",                                     inspiration: "core",                         required: [],                status: "live" },
  { group: "JARVIS",  name: "Wake word detection",         blurb: "Passive listening for your agent's name → hands-free call mode",                     inspiration: "Iron Man - hands-free",        required: ["mic"],           status: "live" },

  // — NEW: Code & Intelligence —
  { group: "JARVIS",  name: "Code generation & debugging", blurb: "Write, explain, debug, refactor, review code in any language",                       inspiration: "Tony Stark coding the suit",   required: [],                status: "live", icon: Code },
  { group: "JARVIS",  name: "Deep research mode",          blurb: "Multi-step web research with synthesis and citations",                             inspiration: "JARVIS full analysis",          required: ["key"], envKey: "SERPER_API_KEY", status: "live", icon: Search },
  { group: "JARVIS",  name: "Smart summaries",             blurb: "TL;DR any document, article, or webpage - choose depth level",                     inspiration: "Rapid information processing",  required: [],                status: "live", icon: FileText },

  // — NEW: Music & Media —
  { group: "JARVIS",  name: "Music playback control",      blurb: "Play any song/artist on Spotify, YouTube Music, Apple Music, JioSaavn",            inspiration: "IM1 garage scene",              required: [],                status: "live", icon: Music },

  // — NEW: Protocols & Automation —
  { group: "JARVIS",  name: "Named protocols",             blurb: "HOME, WORK, SLEEP, WAKE, SOS - one-word triggers multi-step routines",             inspiration: "Stark house party protocol",   required: [],                status: "live", icon: Shield },
  { group: "JARVIS",  name: "Proactive intelligence",      blurb: "Traffic alerts, meeting warnings, pattern-based suggestions - unprompted",         inspiration: "JARVIS anticipates needs",      required: [],                status: "live", icon: Lightbulb },
  { group: "JARVIS",  name: "Weekly report generator",     blurb: "Tasks completed, goals progress, calendar highlights - full weekly review",         inspiration: "Sunday morning briefing",      required: [],                status: "live", icon: Brain },

  // — NEW: Booking & Reservations —
  { group: "JARVIS",  name: "Booking & reservations",      blurb: "Search restaurants, hotels, flights, events - opens booking pages ready",            inspiration: "IM2 party planning",            required: [],                status: "live", icon: Calendar },

  // — NEW: Health & Devices (not yet connected) —
  { group: "JARVIS",  name: "Health data retrieval",       blurb: "JARVIS Health Log for reported steps, heart rate, sleep - wearable APIs optional", inspiration: "IM3 health tracking",           required: [],                status: "partial", icon: HeartPulse },
  { group: "JARVIS",  name: "Smart home control",          blurb: "JARVIS Home Hub: lights, locks, climate, media - plus this phone (flashlight, vibrate, brightness)", inspiration: "Stark Tower controls",         required: [],                status: "live", icon: Home },
  { group: "JARVIS",  name: "Emergency alert",             blurb: "Open dialer + WhatsApp for emergency contacts with your location",                  inspiration: "Emergency protocols",          required: [],                status: "partial", icon: Phone },

  // — EDITH canon —
  { group: "E.D.I.T.H.", name: "Vision analysis",          blurb: "Share your screen or webcam → AI describes it & extracts text/data",                 inspiration: "Far From Home - HUD",          required: ["cam"],           status: "live" },
  { group: "E.D.I.T.H.", name: "Threat & anomaly scanning", blurb: "Continuously evaluates incoming info for risk patterns",                           inspiration: "Far From Home - drones",       required: [],                status: "planned" },
  { group: "E.D.I.T.H.", name: "Predictive routine",       blurb: "\"You usually do X at this time\" suggestions",                                     inspiration: "Iron Man 3 - JARVIS habits",   required: [],                status: "planned" },
  { group: "E.D.I.T.H.", name: "Encrypted memory",         blurb: "Fernet-encrypted persistent memory of facts",                                        inspiration: "Stark security",               required: [],                status: "live" },

  // — NEW: E.D.I.T.H. —
  { group: "E.D.I.T.H.", name: "130+ app deep links",      blurb: "Open ANY app or service by name - Spotify, Amazon, GitHub, Netflix, Uber, and more", inspiration: "Open anything, anywhere",       required: [],                status: "live", icon: Lightbulb },

  // — ULTRON canon —
  { group: "ULTRON",  name: "Parallel multi-agent reasoning", blurb: "N sub-agents tackle distinct angles in parallel, synthesize",                    inspiration: "Age of Ultron",                required: [],                status: "live", premium: true },
  { group: "ULTRON",  name: "Internet-wide sift",          blurb: "Wide-net research across web + news + docs at once",                                inspiration: "Age of Ultron",                required: ["key"], envKey: "SERPER_API_KEY", status: "partial" },
  { group: "ULTRON",  name: "Strategic decision tree",     blurb: "Pros/cons/risks → recommendation with confidence",                                  inspiration: "Age of Ultron",                required: [],                status: "live" },
  { group: "ULTRON",  name: "Self-monitoring telemetry",   blurb: "Latency, cost, token usage dashboard",                                              inspiration: "Stark systems",                required: [],                status: "planned" },
];
