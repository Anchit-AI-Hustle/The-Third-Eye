"use client";

import { useEffect, useRef, useState, useCallback } from "react";

import { useWakeLock } from "./useWakeLock";
import { startSpeechCapture, transcribeSpeechSegment, type SpeechCapture } from "@/lib/speechCapture";

type Listener = (trigger: string, transcript: string) => void;

const DEFAULT_TRIGGERS = ["hi", "hey", "ok", "hello"];

// How long to wait for the recognizer to call an utterance final before waking
// on the interim anyway. Only applies when the name arrived with a command
// attached — long enough to catch the end of a sentence, short enough that the
// panel does not feel slow.
const SETTLE_MS = 1200;

export interface WakeWordOptions {
  agentName: string;          // "JARVIS" / "FRIDAY" / "E.D.I.T.H." / "ULTRON" / custom
  enabled: boolean;
  onWake: Listener;
  extraTriggers?: string[];   // ["hi", "hey", "ok"]
  cooldownMs?: number;        // time between fires
  /** 0.2–1. Higher = quieter speech still counts as a hidden-tab chunk. */
  sensitivity?: number;
  /**
   * Keep listening while the tab is hidden by transcribing microphone chunks
   * server-side. Costs a transcription call per chunk that contains speech, so
   * it is opt-in. Without it, hiding the tab stops wake-word detection until
   * the tab is visible again — which is the browser's behaviour, not a bug.
   */
  backgroundListening?: boolean;
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

// An initialised name normalises to spaced letters ("E.D.I.T.H." → "e d i t h"),
// but the recognizer transcribes it as one word. Both forms have to be triggers
// or such an agent only ever answers to "hey".
function compact(s: string): string {
  return normalize(s).replace(/ /g, "");
}

export function buildTriggerSet(agentName: string, extras: string[] = DEFAULT_TRIGGERS): string[] {
  const triggers = new Set<string>();
  const a = normalize(agentName);
  if (a) {
    triggers.add(a);
    a.split(" ").forEach((p) => { if (p.length >= 2) triggers.add(p); });
    const joined = compact(a);
    if (joined.length >= 3) triggers.add(joined);
  }
  extras.forEach((e) => { const n = normalize(e); if (n) triggers.add(n); });
  return Array.from(triggers).sort((x, y) => y.length - x.length);
}

export function matchTrigger(text: string, triggers: string[]): string | null {
  const t = normalize(text);
  if (!t) return null;
  for (const trig of triggers) {
    if (t === trig) return trig;
    if (t.startsWith(trig + " ")) return trig;
    if (t.includes(" " + trig + " ")) return trig;
    // The name at the end of a sentence ("what time is it, JARVIS"), which the
    // rule above misses for want of a trailing space. Deliberately anchored to
    // a word boundary: a plain substring test woke an agent called E.D.I.T.H.
    // on "Meredith" and then treated the rest of that sentence as a command.
    if (t.endsWith(" " + trig)) return trig;
  }
  return null;
}

// Politeness the user says around the name, which is not part of the command.
const FILLERS = ["hi", "hey", "ok", "okay", "hello", "yo", "please", "can you", "could you"];

// The only words that may come before the name in something addressed to the
// agent: a greeting, or the noise people start a sentence with. Anything else
// means the name appeared inside a sentence about something else — "next
// FRIDAY, can you send the invoice" is a shipped persona's name used as a
// weekday, and acting on the remainder would post overheard speech to chat.
const LEAD_IN = new Set([
  "um", "uh", "er", "erm", "so", "well", "hi", "hey", "ok", "okay", "hello", "yo",
]);

/**
 * Whether the agent was woken by its own name rather than by a bare greeting.
 *
 * "hey" / "ok" / "hi" wake the agent by design, but they are also words people
 * say to each other. Acting on whatever follows one of those would post
 * overheard conversation — "hey, what time is it", "ok let's go home" — as an
 * authenticated chat turn. Only the name is specific enough to treat the rest
 * of the sentence as a command meant for the agent.
 */
export function isNameTrigger(trigger: string, agentName: string): boolean {
  const t = normalize(trigger);
  const a = normalize(agentName);
  if (!t || !a) return false;
  if (t === a || a.split(" ").includes(t)) return true;
  return compact(t) === compact(a);
}

/**
 * What the user actually asked, from the utterance that woke the agent.
 *
 * "Hey JARVIS, what's the weather" carries its command in the same breath as
 * the name. Waking and then listening from scratch throws that away and makes
 * the user say it twice. Returns "" when they only said the name, or when the
 * name turned up inside a sentence that was not addressed to the agent — the
 * signal to open up and listen rather than to answer something.
 */
export function stripWakeTrigger(transcript: string, trigger: string): string {
  let rest = normalize(transcript);
  const trig = normalize(trigger);
  const at = trig ? rest.indexOf(trig) : -1;
  if (at >= 0) {
    // Someone addressing the agent leads with its name, give or take a greeting.
    // Substantive words in front of it mean the sentence is about something
    // else and its remainder is not a command.
    const before = rest.slice(0, at).trim();
    if (before && before.split(" ").some((w) => !LEAD_IN.has(w))) return "";
    rest = rest.slice(at + trig.length).trim();
  }

  // Drop leading filler words, and any other trigger word sitting next to the
  // name ("hey jarvis" matches on "jarvis" and leaves "hey" behind when the
  // recognizer reorders, "ok jarvis please ..." leaves "please").
  let changed = true;
  while (changed) {
    changed = false;
    for (const f of FILLERS) {
      if (rest === f) { rest = ""; changed = true; break; }
      if (rest.startsWith(f + " ")) { rest = rest.slice(f.length + 1); changed = true; break; }
    }
  }

  rest = rest.trim();
  // A single stray word is far more likely to be a misheard fragment of the
  // name than a command worth acting on.
  return rest.split(" ").filter(Boolean).length >= 2 ? rest : "";
}

export function useWakeWord({
  agentName,
  enabled,
  onWake,
  extraTriggers,
  cooldownMs = 1500,
  backgroundListening = true,
  sensitivity = 0.7,
}: WakeWordOptions) {
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(false);
  const [hearingInBackground, setHearingInBackground] = useState(false);
  const activeRef = useRef(false);
  const lastFireRef = useRef(0);
  const triggersRef = useRef<string[]>([]);
  const agentNameRef = useRef(agentName);
  const onWakeRef = useRef(onWake);
  const wakeLock = useWakeLock();

  // Held for as long as the wake word is enabled. An open capture stream is
  // what keeps the tab off the browser's aggressively-throttled background
  // path, and it is also what the hidden-tab fallback records from.
  const captureRef = useRef<SpeechCapture | null>(null);
  const bgActiveRef = useRef(false);
  const restartCaptureRef = useRef<() => void>(() => {});

  useEffect(() => { onWakeRef.current = onWake; }, [onWake]);
  useEffect(() => {
    agentNameRef.current = agentName;
    triggersRef.current = buildTriggerSet(agentName, [...DEFAULT_TRIGGERS, ...(extraTriggers ?? [])]);
  }, [agentName, extraTriggers]);

  useEffect(() => {
    setSupported(!!navigator?.mediaDevices?.getUserMedia && !!(window.AudioContext || (window as any).webkitAudioContext));
  }, []);

  const fire = useCallback((trigger: string, text: string) => {
    const now = Date.now();
    if (now - lastFireRef.current < cooldownMs) return;
    lastFireRef.current = now;
    onWakeRef.current(trigger, text.trim());
  }, [cooldownMs]);

  // ─── Hidden-tab listening ──────────────────────────────────────────────────

  const stopBackground = useCallback(() => {
    bgActiveRef.current = false;
    setHearingInBackground(false);
    captureRef.current?.stop();
    captureRef.current = null;
  }, []);

  const recordBackgroundChunk = useCallback(() => {
    if (!bgActiveRef.current || captureRef.current) return;
    void startSpeechCapture({
      onSegment: async (audio) => {
        if (!bgActiveRef.current) return;
        try {
          const text = await transcribeSpeechSegment(audio);
          if (!text || !bgActiveRef.current) return;
          const trig = matchTrigger(text, triggersRef.current);
          if (trig) fire(trig, text);
        } catch { /* keep passive listening alive after transient provider errors */ }
      },
      onError: () => { bgActiveRef.current = false; setListening(false); },
      onTrackEnded: () => {
        captureRef.current = null;
        if (bgActiveRef.current) setTimeout(() => restartCaptureRef.current(), 250);
      },
    }).then((capture) => {
      if (bgActiveRef.current) captureRef.current = capture;
      else capture.stop();
    }).catch(() => { bgActiveRef.current = false; setListening(false); });
  }, [fire]);
  restartCaptureRef.current = recordBackgroundChunk;

  const startBackground = useCallback(() => {
    if (bgActiveRef.current) return;
    bgActiveRef.current = true;
    setHearingInBackground(document.visibilityState === "hidden");
    recordBackgroundChunk();
  }, [recordBackgroundChunk]);

  const stop = useCallback(() => {
    activeRef.current = false;
    stopBackground();
    setListening(false);
    wakeLock.release();
  }, [stopBackground, wakeLock]);

  const start = useCallback(() => {
    if (!supported || activeRef.current) return;
    activeRef.current = true;
    setListening(true);
    wakeLock.acquire();
    startBackground();
  }, [supported, startBackground, wakeLock]);

  useEffect(() => {
    if (enabled && supported) {
      start();
      return () => stop();
    }
    stop();
  }, [enabled, supported, start, stop]);

  // Keep VAD capture active in the foreground. Hidden-tab capture is opt-in;
  // browsers may suspend audio in the background, so restart cleanly on return.
  useEffect(() => {
    if (!enabled || !supported) return;
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        setHearingInBackground(false);
        if (activeRef.current) startBackground();
      } else if (!backgroundListening) {
        stopBackground();
      } else {
        setHearingInBackground(true);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [enabled, supported, backgroundListening, startBackground, stopBackground]);

  return { listening, supported, hearingInBackground };
}
