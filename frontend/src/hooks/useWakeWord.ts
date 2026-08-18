"use client";

import { useEffect, useRef, useState, useCallback } from "react";

import { useWakeLock } from "./useWakeLock";

type Listener = (trigger: string, transcript: string) => void;

// If the recognizer emits no event for this long while it is supposed to be
// listening, treat it as silently dead and force a restart. Chrome cuts
// SpeechRecognition after ~60s of silence and on network blips, and does not
// always fire onend — so the "relaunch on onend" path alone is not enough.
const WATCHDOG_MS = 10_000;

// Backgrounded fallback. SpeechRecognition is suspended by the browser whenever
// the tab is hidden and does not resume on its own, so while hidden we listen
// through the microphone directly: fixed-length chunks, gated by loudness, and
// transcribed only when they contain speech.
const BG_CHUNK_MS = 6_000;
// Peak amplitude below this is treated as silence and never sent for
// transcription. Matches the day recorder's threshold.
const BG_SILENCE_PEAK = 0.012;

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
 * the user say it twice. Returns "" when they only said the name, which is the
 * signal to open up and listen rather than to answer something.
 */
export function stripWakeTrigger(transcript: string, trigger: string): string {
  let rest = normalize(transcript);
  const trig = normalize(trigger);
  const at = trig ? rest.indexOf(trig) : -1;
  if (at >= 0) rest = rest.slice(at + trig.length).trim();

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
}: WakeWordOptions) {
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(false);
  const [hearingInBackground, setHearingInBackground] = useState(false);
  const activeRef = useRef(false);
  const recRef = useRef<any>(null);
  const lastFireRef = useRef(0);
  const triggersRef = useRef<string[]>([]);
  const agentNameRef = useRef(agentName);
  const onWakeRef = useRef(onWake);
  const lastEventRef = useRef(0);
  const launchRef = useRef<() => void>(() => {});
  // An utterance that named the agent AND carried a command, held until it is
  // complete. See onresult.
  const pendingRef = useRef<{ trigger: string; text: string } | null>(null);
  const settleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wakeLock = useWakeLock();

  // Held for as long as the wake word is enabled. An open capture stream is
  // what keeps the tab off the browser's aggressively-throttled background
  // path, and it is also what the hidden-tab fallback records from.
  const streamRef = useRef<MediaStream | null>(null);
  const bgRecorderRef = useRef<MediaRecorder | null>(null);
  const bgTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bgActiveRef = useRef(false);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const peakRef = useRef(0);
  const rafRef = useRef(0);

  useEffect(() => { onWakeRef.current = onWake; }, [onWake]);
  useEffect(() => {
    agentNameRef.current = agentName;
    triggersRef.current = buildTriggerSet(agentName, extraTriggers ?? DEFAULT_TRIGGERS);
  }, [agentName, extraTriggers]);

  useEffect(() => {
    const SR = typeof window !== "undefined"
      ? (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition
      : null;
    setSupported(!!SR);
  }, []);

  const clearSettle = useCallback(() => {
    if (settleRef.current) { clearTimeout(settleRef.current); settleRef.current = null; }
    pendingRef.current = null;
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
    if (bgTimerRef.current) { clearTimeout(bgTimerRef.current); bgTimerRef.current = null; }
    try {
      if (bgRecorderRef.current && bgRecorderRef.current.state !== "inactive") {
        bgRecorderRef.current.stop();
      }
    } catch { /* already torn down */ }
    bgRecorderRef.current = null;
  }, []);

  const recordBackgroundChunk = useCallback(() => {
    const stream = streamRef.current;
    if (!stream || !bgActiveRef.current || typeof MediaRecorder === "undefined") return;

    const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"]
      .find((m) => MediaRecorder.isTypeSupported?.(m)) || "";
    let rec: MediaRecorder;
    try {
      rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    } catch {
      return;
    }
    bgRecorderRef.current = rec;

    const parts: Blob[] = [];
    peakRef.current = 0;
    rec.ondataavailable = (e) => { if (e.data.size) parts.push(e.data); };

    rec.onstop = async () => {
      const loudEnough = peakRef.current >= BG_SILENCE_PEAK;
      const blob = new Blob(parts, { type: mime || "audio/webm" });

      // Queue the next chunk before awaiting the network so listening is
      // continuous rather than gated on transcription latency.
      if (bgActiveRef.current) recordBackgroundChunk();

      if (!loudEnough || blob.size < 2000) return;
      try {
        const fd = new FormData();
        fd.append("audio", blob, "chunk.webm");
        const res = await fetch("/api/transcribe", { method: "POST", body: fd });
        const data = await res.json().catch(() => ({}));
        const text: string = typeof data?.text === "string" ? data.text : "";
        if (!text) return;
        const trig = matchTrigger(text, triggersRef.current);
        if (trig) fire(trig, text);
      } catch { /* a dropped chunk must not stop the loop */ }
    };

    try {
      rec.start();
      bgTimerRef.current = setTimeout(() => {
        if (rec.state !== "inactive") rec.stop();
      }, BG_CHUNK_MS);
    } catch { /* next visibility change will retry */ }
  }, [fire]);

  const startBackground = useCallback(() => {
    if (!backgroundListening || bgActiveRef.current || !streamRef.current) return;
    bgActiveRef.current = true;
    setHearingInBackground(true);
    recordBackgroundChunk();
  }, [backgroundListening, recordBackgroundChunk]);

  // ─── SpeechRecognition (used while the tab is visible) ─────────────────────

  const stop = useCallback(() => {
    activeRef.current = false;
    clearSettle();
    stopBackground();
    try { recRef.current?.abort(); } catch { /* noop */ }
    recRef.current = null;

    cancelAnimationFrame(rafRef.current);
    analyserRef.current = null;
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;

    setListening(false);
    wakeLock.release();
  }, [clearSettle, stopBackground, wakeLock]);

  const start = useCallback(() => {
    if (!supported || activeRef.current) return;
    const SRClass = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    if (!SRClass) return;

    activeRef.current = true;
    setListening(true);
    lastEventRef.current = Date.now();
    // Keep the screen awake: a slept/locked screen is what suspends
    // SpeechRecognition, so this is what lets a phone on a desk keep listening.
    wakeLock.acquire();

    const launchInstance = () => {
      if (!activeRef.current) return;
      const rec = new SRClass();
      recRef.current = rec;
      rec.continuous = true;
      rec.interimResults = true;
      rec.maxAlternatives = 1;
      rec.lang = "";

      rec.onstart = () => { lastEventRef.current = Date.now(); };

      rec.onresult = (event: any) => {
        lastEventRef.current = Date.now();
        let chunk = "";
        let isFinal = false;
        for (let i = event.resultIndex; i < event.results.length; i++) {
          chunk += event.results[i][0].transcript;
          if (event.results[i].isFinal) isFinal = true;
        }
        const trig = matchTrigger(chunk, triggersRef.current);
        if (!trig) return;

        // Nothing to wait for: either just the name, or a greeting trigger
        // whose remaining words are not treated as a command anyway. Waking now
        // matters — a delay here is the user staring at a panel that has not
        // opened, which is the thing they notice.
        if (!isNameTrigger(trig, agentNameRef.current) || !stripWakeTrigger(chunk, trig)) {
          clearSettle();
          fire(trig, chunk);
          return;
        }

        // The name came with a command attached. Waking on this interim would
        // hand over to the main recognizer mid-sentence and lose the rest of
        // it, so hold until the recognizer calls the utterance final — or
        // until they stop talking long enough that it will not.
        pendingRef.current = { trigger: trig, text: chunk };
        if (isFinal) {
          clearSettle();
          fire(trig, chunk);
          pendingRef.current = null;
          return;
        }
        if (settleRef.current) clearTimeout(settleRef.current);
        settleRef.current = setTimeout(() => {
          const p = pendingRef.current;
          pendingRef.current = null;
          settleRef.current = null;
          if (p) fire(p.trigger, p.text);
        }, SETTLE_MS);
      };

      rec.onerror = (e: any) => {
        if (e.error === "not-allowed" || e.error === "service-not-allowed") {
          stop();
          return;
        }
      };

      rec.onend = () => {
        if (activeRef.current) setTimeout(launchInstance, 250);
      };

      try { rec.start(); } catch { setTimeout(launchInstance, 500); }
    };

    launchRef.current = launchInstance;
    launchInstance();
  }, [supported, fire, stop, clearSettle, wakeLock]);

  // Force a fresh recognizer when the current one has gone silently dead.
  const forceRestart = useCallback(() => {
    if (!activeRef.current) return;
    const old = recRef.current;
    recRef.current = null;
    // Detach handlers BEFORE aborting: abort() fires onend, and the old
    // onend would schedule its own relaunch that races the fresh instance.
    if (old) {
      old.onresult = null;
      old.onerror = null;
      old.onend = null;
      old.onstart = null;
      try { old.abort(); } catch { /* noop */ }
    }
    lastEventRef.current = Date.now();
    launchRef.current();
  }, []);

  useEffect(() => {
    if (enabled && supported) {
      start();
      return () => stop();
    }
    stop();
  }, [enabled, supported, start, stop]);

  // Acquire the microphone once, for the whole time the wake word is enabled.
  // Two reasons: a tab holding a live capture stream is exempted from the
  // harshest background throttling, and the hidden-tab fallback needs a stream
  // that is already open — asking for one while hidden is refused.
  useEffect(() => {
    if (!enabled || !supported || typeof navigator === "undefined") return;
    let cancelled = false;

    navigator.mediaDevices?.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
    }).then((stream) => {
      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;

      // Track loudness so the hidden-tab path can skip silent chunks instead of
      // paying for a transcription of a quiet room.
      try {
        const AC = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext;
        const ctx = new AC();
        audioCtxRef.current = ctx;
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        ctx.createMediaStreamSource(stream).connect(analyser);
        analyserRef.current = analyser;

        const buf = new Uint8Array(analyser.fftSize);
        const measure = () => {
          const an = analyserRef.current;
          if (!an) return;
          an.getByteTimeDomainData(buf);
          let peak = 0;
          for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs((buf[i] - 128) / 128));
          peakRef.current = Math.max(peakRef.current, peak);
          rafRef.current = requestAnimationFrame(measure);
        };
        rafRef.current = requestAnimationFrame(measure);
      } catch { /* loudness gating is an optimisation, not a requirement */ }

      // Already hidden when permission resolved — start the fallback now.
      if (document.visibilityState === "hidden") startBackground();
    }).catch(() => { /* denied: the visible-tab recognizer still works */ });

    return () => { cancelled = true; };
  }, [enabled, supported, startBackground]);

  // Recovery and handover. The recognizer is suspended while hidden, so hand
  // over to microphone chunks on hide and back to the recognizer on show.
  useEffect(() => {
    if (!enabled || !supported) return;

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        stopBackground();
        forceRestart();
      } else {
        startBackground();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    const watchdog = setInterval(() => {
      // Deliberately runs while hidden too. It used to return early when the
      // tab was not visible, which meant a recognizer that died in the
      // background was never revived and listening simply stopped.
      if (document.visibilityState !== "visible") {
        if (backgroundListening && !bgActiveRef.current) startBackground();
        return;
      }
      if (Date.now() - lastEventRef.current > WATCHDOG_MS) forceRestart();
    }, WATCHDOG_MS / 2);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      clearInterval(watchdog);
    };
  }, [enabled, supported, forceRestart, startBackground, stopBackground, backgroundListening]);

  return { listening, supported, hearingInBackground };
}
