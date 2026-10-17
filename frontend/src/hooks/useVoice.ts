"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { naturalVoiceOn, speakNatural, stopNatural } from "@/lib/naturalVoice";
import { speechRecognizer } from "@/lib/speechRecognizer";
import { downsample, encodeWav, PcmClip, TARGET_RATE } from "@/lib/pcmClip";

import { useWakeLock } from "./useWakeLock";

// Mirrors WATCHDOG_MS in useWakeWord: if the recognizer goes quiet for this
// long while it should be listening, assume it died silently and restart.
const STT_WATCHDOG_MS = 10_000;

export type AudioState = "idle" | "waiting" | "speaking" | "transcribing";

// ─── Voice STT (Web Speech API + AudioContext level meter) ───────────────────

export interface VoiceSTTCallbacks {
  onTranscript: (text: string) => void;
  onInterim?: (text: string) => void;   // live partial text while speaking
  onLevel?: (level: number) => void;    // 0-100 audio level
  onSpeechStart?: () => void;
  onSpeechEnd?: () => void;
  shouldSuppress?: () => boolean;       // return true to ignore audio (e.g. TTS active)
  lang?: string;
}

// Time-domain peak, 0–1. Averaging FFT bins hides speech: a few loud low
// bins disappear into a hundred silent ones, so the old threshold never fired
// and the server never received audio when the browser recognizer was down.
const SPEECH_PEAK = 0.02;
const BARGE_PEAK = 0.12;
// A phrase ends after this much quiet. Shorter cut sentences in two at a
// natural pause, and Whisper transcribes fragments much worse than sentences.
const SILENCE_MS = 1100;
// Audio kept from just before speech is detected, so the first word is whole.
const PRE_ROLL_S = 0.5;
// Speech has to clear the room's own level by this factor, and last this many
// frames (~60/s), before a phrase is sent: fans, traffic and keyboard clicks
// otherwise reach Whisper, which turns noise into "Thank you." in any language.
const NOISE_MARGIN = 2.5;
const MIN_SPEECH_FRAMES = 18;
const BARGE_HOLD_MS = 280;
// The assistant speaks through the OS voice (speechSynthesis), which Chrome's
// echo cancellation does not hear, so its own voice comes back through the
// mic. Learn how loud that echo is at the start of each reply, then count
// only sustained sound clearly above it as the user talking over it.
const ECHO_LEARN_MS = 600;
const ECHO_MARGIN = 1.6;
const ECHO_DECAY = 0.998;
const BARGE_FRAMES = 15;

const words = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean);

/**
 * A transcript that is the assistant's own words heard back: every word but
 * one in ten appears, in order, in what it just said. A user reply adds words
 * of its own ("yes, send the email to John") or reorders them, so it passes.
 */
export function isEchoOf(transcript: string, spoken: string): boolean {
  const heard = words(transcript);
  if (heard.length < 3) return false;
  const said = words(spoken);
  // Longest common subsequence of the two word lists.
  let prev = new Array(said.length + 1).fill(0);
  for (const h of heard) {
    const row = [0];
    for (let j = 0; j < said.length; j++) row.push(h === said[j] ? prev[j] + 1 : Math.max(prev[j + 1], row[j]));
    prev = row;
  }
  return heard.length - prev[said.length] <= Math.floor(heard.length * 0.1);
}

// What the assistant last said, when it started, and until when a transcript
// of it counts as echo (Infinity while it is still speaking). The recognizer
// hands back its last words within a second or so of the voice stopping.
const ECHO_TEXT_MS = 1_500;
// Watchdog for the OS voice: a reply that has not started by this point was
// dropped, and one still "speaking" well past its length lost its end event.
const SPEECH_START_TIMEOUT_MS = 3_000;
const SPEECH_MS_PER_CHAR = 90;
const SPEECH_END_GRACE_MS = 4_000;
const lastSpoken = { text: "", startedAt: 0, until: 0 };
const ttsSpeaking = () => lastSpoken.until === Infinity;

export function createBargeDetector(now: () => number = Date.now) {
  let since = 0;
  let echo = 0;
  let loud = 0;
  return {
    reset() { since = 0; echo = 0; loud = 0; },
    /**
     * True once the user has spoken over the assistant. While it is speaking
     * that means clearly above its own echo; in the short pause after it stops
     * there is no echo left, so a normal voice counts at once.
     */
    check(peak: number, speaking = true): boolean {
      if (!speaking) return peak >= BARGE_PEAK;
      const t = now();
      if (!since) since = t;
      if (t - since < ECHO_LEARN_MS) { echo = Math.max(echo, peak); return false; }
      if (peak >= Math.max(BARGE_PEAK, echo * ECHO_MARGIN)) {
        if (++loud >= BARGE_FRAMES) { loud = 0; return true; }
        return false;
      }
      loud = 0;
      echo = Math.max(echo * ECHO_DECAY, peak);
      return false;
    },
  };
}

export function pcmPeak(buf: Uint8Array): number {
  let peak = 0;
  for (let i = 0; i < buf.length; i++) {
    const v = Math.abs(buf[i] - 128) / 128;
    if (v > peak) peak = v;
  }
  return peak;
}

/** Record each spoken phrase and transcribe it on the server when the browser recognizer returns nothing. */
function armUtteranceRecorder(
  analyser: AnalyserNode,
  active: () => boolean,
  suppressed: () => boolean,
  lang: () => string | undefined,
  emit: (text: string) => void,
  onTranscribing: () => void,
  onBarge: () => void,
  onEmpty: () => void,
  onFail: () => void,
  skip: () => boolean,
): () => void {
  const ctx = analyser.context as AudioContext;
  if (typeof ctx.createScriptProcessor !== "function") return () => {};
  let raf = 0;
  let voiced = false;
  let silenceAt = 0;
  let stopped = false;
  let holdUntil = 0;
  let barged = false;
  let floor = 0;
  let floorSeeded = false;
  let speechFrames = 0;
  const barge = createBargeDetector();
  let replyStart = 0;
  // Raw samples rather than a MediaRecorder: see lib/pcmClip.ts.
  const clip = new PcmClip(ctx.sampleRate, Math.round(ctx.sampleRate * PRE_ROLL_S));
  const tap = ctx.createScriptProcessor(4096, 1, 1);
  tap.onaudioprocess = (e) => { if (!stopped) clip.push(new Float32Array(e.inputBuffer.getChannelData(0))); };
  analyser.connect(tap);
  tap.connect(ctx.destination);

  const drop = () => {
    clip.drop();
    voiced = false;
    silenceAt = 0;
    speechFrames = 0;
  };

  const flush = async (blob: Blob) => {
    if (stopped || blob.size < 400 || skip()) return;
    onTranscribing();
    try {
      const fd = new FormData();
      fd.append("audio", blob, "speech.wav");
      const code = lang();
      if (code) fd.append("lang", code);
      const res = await fetch("/api/transcribe", { method: "POST", body: fd, signal: AbortSignal.timeout(25_000) });
      const data = await res.json().catch(() => ({}));
      const text = res.ok && typeof data?.text === "string" ? data.text.trim() : "";
      if (!res.ok) onFail();
      if (text && !skip()) emit(text);
      else onEmpty();
    } catch {
      onFail();
      onEmpty();
    }
  };

  const begin = () => {
    if (!clip.recording) clip.start();
  };

  const end = () => {
    if (speechFrames < MIN_SPEECH_FRAMES) { drop(); return; }
    if (clip.recording) void flush(encodeWav(downsample(clip.stop(), ctx.sampleRate, TARGET_RATE), TARGET_RATE));
    voiced = false;
    silenceAt = 0;
    speechFrames = 0;
  };

  const time = new Uint8Array(analyser.fftSize);
  const tick = () => {
    if (stopped || !active()) return;
    analyser.getByteTimeDomainData(time);
    const peak = pcmPeak(time);
    if (suppressed()) {
      // A phrase still recording when the reply starts would capture the
      // assistant's voice along with the user's.
      if (voiced) drop();
      if (lastSpoken.startedAt !== replyStart) { replyStart = lastSpoken.startedAt; barge.reset(); }
      if (!barged && barge.check(peak, ttsSpeaking())) {
        barged = true;
        onBarge();
        drop();
        holdUntil = Date.now() + BARGE_HOLD_MS;
      }
      raf = requestAnimationFrame(tick);
      return;
    }
    barge.reset();
    barged = false;
    const threshold = Math.max(SPEECH_PEAK, floor * NOISE_MARGIN);
    // Seeded once: re-seeding whenever the level read exactly zero made the
    // first loud frame of speech the room's level, and the speaker inaudible.
    if (!voiced) { floor = floorSeeded ? floor * 0.98 + peak * 0.02 : peak; floorSeeded = true; }
    if (peak >= threshold) {
      if (voiced) speechFrames++;
      if (Date.now() >= holdUntil) {
        if (!voiced) { voiced = true; begin(); }
        silenceAt = 0;
      }
    } else {
      if (voiced && Date.now() >= holdUntil) {
        if (!silenceAt) silenceAt = Date.now();
        else if (Date.now() - silenceAt > SILENCE_MS) end();
      }
    }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);

  return () => {
    stopped = true;
    cancelAnimationFrame(raf);
    drop();
    tap.onaudioprocess = null;
    try { analyser.disconnect(tap); tap.disconnect(); } catch { /* already disconnected */ }
  };
}

export function useVoiceSTT(cb: VoiceSTTCallbacks) {
  const [audioState, setAudioState] = useState<AudioState>("idle");
  const [supported, setSupported] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  // "network" / "audio-capture" mean recognition is running but never gets a
  // result back — the mic looks "on" forever with nothing to show for it.
  // "no-speech" is just silence between utterances and isn't surfaced.
  const [recognitionIssue, setRecognitionIssue] = useState<string | null>(null);
  const [whisperAvailable, setWhisperAvailable] = useState<boolean | null>(null);

  const activeRef = useRef(false);
  const cbRef = useRef(cb);
  useEffect(() => { cbRef.current = cb; }, [cb]);

  const recRef = useRef<any>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastEventRef = useRef(0);
  const startRecRef = useRef<() => void>(() => {});
  const lastTranscriptRef = useRef<{ text: string; at: number }>({ text: "", at: 0 });
  const webFinalAt = useRef(0);
  const stuckTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wakeLock = useWakeLock();

  const armStuck = () => {
    if (stuckTimer.current) clearTimeout(stuckTimer.current);
    // Web Speech can report "speech ended" and then never return text. Don't
    // leave the composer on "thinking" after the server has also had its turn.
    stuckTimer.current = setTimeout(() => {
      stuckTimer.current = null;
      if (Date.now() - webFinalAt.current > 2500) cbRef.current.onInterim?.("");
    }, 9000);
  };
  const clearStuck = () => {
    if (stuckTimer.current) { clearTimeout(stuckTimer.current); stuckTimer.current = null; }
  };

  const emitTranscript = useCallback((text: string) => {
    const t = text.trim();
    if (!t || cbRef.current.shouldSuppress?.()) return;
    if (Date.now() < lastSpoken.until && isEchoOf(t, lastSpoken.text)) return;
    const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, "").replace(/\s+/g, " ").trim();
    const now = Date.now();
    if (norm(t) && norm(t) === norm(lastTranscriptRef.current.text) && now - lastTranscriptRef.current.at < 6000) return;
    lastTranscriptRef.current = { text: t, at: now };
    setRecognitionIssue(null);
    clearStuck();
    cbRef.current.onInterim?.("");
    cbRef.current.onTranscript(t);
  }, []);

  useEffect(() => {
    const SR = speechRecognizer();
    const mic = typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
    setSupported(!!SR || mic);

    // Check Whisper (200 = available + key set, 503 = no key)
    fetch("/api/transcribe", { method: "POST", body: new FormData() })
      .then((r) => setWhisperAvailable(r.status === 200))
      .catch(() => setWhisperAvailable(false));
  }, []);

  const stopEarRef = useRef<(() => void) | null>(null);
  const resumeCtxRef = useRef<(() => void) | null>(null);
  const srDelayRef = useRef(150);

  const startMeter = useCallback(async (opened?: AudioContext) => {
    if (streamRef.current) { void opened?.close().catch(() => {}); return; }
    const synthetic = () => {
      const tick = () => {
        if (!activeRef.current) return;
        const level = 25 + Math.round(Math.sin(Date.now() / 200) * 20 + 20);
        cbRef.current.onLevel?.(level);
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    };
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      if (!activeRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        void opened?.close().catch(() => {});
        return;
      }
      streamRef.current = stream;
      const ctx = opened ?? new AudioContext();
      // Chrome/Safari can hand back a context in "suspended" state — the await
      // above breaks the direct user-gesture chain autoplay policy checks for.
      // Suspended means getByteFrequencyData reads all zeros forever, so the
      // level meter looks dead even though the mic itself is live.
      if (ctx.state === "suspended") void ctx.resume();
      // A context opened from an effect (wake-word auto-start) stays suspended
      // until the next gesture, and a suspended analyser reads silence forever.
      if (resumeCtxRef.current) {
        window.removeEventListener("pointerdown", resumeCtxRef.current);
        window.removeEventListener("keydown", resumeCtxRef.current);
      }
      const resumeCtx = () => { void audioCtxRef.current?.resume(); };
      resumeCtxRef.current = resumeCtx;
      window.addEventListener("pointerdown", resumeCtx);
      window.addEventListener("keydown", resumeCtx);
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      src.connect(analyser);
      audioCtxRef.current = ctx;
      const time = new Uint8Array(analyser.fftSize);
      stopEarRef.current?.();
      stopEarRef.current = armUtteranceRecorder(
        analyser,
        () => activeRef.current,
        () => !!cbRef.current.shouldSuppress?.(),
        // Unset, Whisper guesses the language per clip and "hears" Ukrainian or
        // Portuguese in noise; the browser language is the right default.
        () => cbRef.current.lang || navigator.language,
        emitTranscript,
        () => {
          cbRef.current.onSpeechEnd?.();
          setAudioState("transcribing");
          armStuck();
        },
        () => { cbRef.current.onSpeechStart?.(); },
        () => {
          setAudioState("waiting");
          cbRef.current.onInterim?.("");
        },
        () => setRecognitionIssue("server"),
        () => Date.now() - webFinalAt.current < 2500,
      );
      const tick = () => {
        if (!activeRef.current) return;
        analyser.getByteTimeDomainData(time);
        const level = Math.min(100, Math.round(pcmPeak(time) * 140));
        cbRef.current.onLevel?.(level);
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch {
      void opened?.close().catch(() => {});
      synthetic();
    }
  }, [emitTranscript]);

  const stopMeter = useCallback(() => {
    stopEarRef.current?.();
    stopEarRef.current = null;
    if (resumeCtxRef.current) {
      window.removeEventListener("pointerdown", resumeCtxRef.current);
      window.removeEventListener("keydown", resumeCtxRef.current);
      resumeCtxRef.current = null;
    }
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    audioCtxRef.current?.close().catch(() => {});
    streamRef.current = null;
    audioCtxRef.current = null;
    cbRef.current.onLevel?.(0);
  }, []);

  const enable = useCallback(async () => {
    if (activeRef.current) return;
    const SRClass = speechRecognizer();
    const canMic = typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
    if (!SRClass && !canMic) return;
    activeRef.current = true;
    setPermissionDenied(false);
    setRecognitionIssue(null);
    lastEventRef.current = Date.now();
    srDelayRef.current = 150;
    // Mid-conversation the screen must not sleep, or the mic is suspended.
    wakeLock.acquire();
    // Opened and resumed here, still inside the tap: Safari only runs an
    // AudioContext started from a gesture. One made after the await below stays
    // suspended, the level meter reads silence, and no phrase is ever recorded.
    let ctx: AudioContext | undefined;
    try { ctx = new AudioContext(); void ctx.resume(); } catch { /* no Web Audio */ }

    // Open the capture stream before the browser recognizer. Starting
    // SpeechRecognition first, then getUserMedia, leaves Chrome's recognizer
    // with a dead mic: it stays on "listening" and never returns words.
    await startMeter(ctx);
    if (!activeRef.current || !SRClass) return;

    const startRec = () => {
      if (!activeRef.current) return;
      const rec = new SRClass();
      recRef.current = rec;
      rec.continuous = true;
      rec.interimResults = true;
      rec.maxAlternatives = 1;
      // An empty lang is what Chrome sends to its speech service as a blank
      // locale, which comes back as a network error and no transcript. The
      // composer starts with lang "" until the user picks one.
      const requested = (cbRef.current.lang || "").trim();
      rec.lang = requested || (typeof navigator !== "undefined" ? navigator.language : "") || "en-US";

      rec.onstart = () => {
        lastEventRef.current = Date.now();
        setAudioState("waiting");
      };

      rec.onspeechstart = () => {
        lastEventRef.current = Date.now();
        setRecognitionIssue(null);
        cbRef.current.onSpeechStart?.();
        if (cbRef.current.shouldSuppress?.()) return;
        setAudioState("speaking");
      };

      rec.onspeechend = () => {
        cbRef.current.onSpeechEnd?.();
        setAudioState("transcribing");
        armStuck();
      };

      rec.onresult = (event: any) => {
        lastEventRef.current = Date.now();
        setRecognitionIssue(null);
        if (cbRef.current.shouldSuppress?.()) return;
        let interim = "";
        let final = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i].isFinal) {
            final += event.results[i][0].transcript;
          } else {
            interim += event.results[i][0].transcript;
          }
        }
        srDelayRef.current = 150;
        if (interim.trim()) cbRef.current.onInterim?.(interim.trim());
        if (final.trim()) {
          webFinalAt.current = Date.now();
          emitTranscript(final.trim());
          setAudioState("waiting");
        }
      };

      rec.onerror = (e: any) => {
        if (e.error === "not-allowed" || e.error === "service-not-allowed") {
          // Speech recognition can be refused while the capture stream is live.
          // Only treat that as a blocked microphone when we never got a stream.
          if (!streamRef.current) {
            setPermissionDenied(true);
            activeRef.current = false;
            setAudioState("idle");
            return;
          }
          setRecognitionIssue("network");
          srDelayRef.current = Math.min(8_000, Math.max(1_500, srDelayRef.current * 2));
        } else if (e.error === "network" || e.error === "audio-capture") {
          setRecognitionIssue(e.error);
          srDelayRef.current = Math.min(8_000, Math.max(1_500, srDelayRef.current * 2));
        }
        setAudioState("waiting");
      };

      rec.onend = () => {
        if (!activeRef.current) { setAudioState("idle"); return; }
        setTimeout(startRec, srDelayRef.current);
      };

      try { rec.start(); } catch { setTimeout(startRec, 500); }
    };

    startRecRef.current = startRec;
    startRec();
  }, [startMeter, wakeLock, emitTranscript]);

  const disable = useCallback(() => {
    activeRef.current = false;
    clearStuck();
    try { recRef.current?.abort(); } catch {}
    recRef.current = null;
    stopMeter();
    setAudioState("idle");
    setRecognitionIssue(null);
    wakeLock.release();
  }, [stopMeter, wakeLock]);

  // Recovery: same failure mode as useWakeWord — a hidden tab or a network
  // blip can kill recognition without onend ever firing.
  const forceRestart = useCallback(() => {
    if (!activeRef.current) return;
    const old = recRef.current;
    recRef.current = null;
    // Detach before abort(), otherwise the old onend relaunches and races
    // the fresh instance (two recognizers fighting over one mic).
    if (old) {
      old.onstart = null;
      old.onspeechstart = null;
      old.onspeechend = null;
      old.onresult = null;
      old.onerror = null;
      old.onend = null;
      try { old.abort(); } catch {}
    }
    lastEventRef.current = Date.now();
    startRecRef.current();
  }, []);

  useEffect(() => {
    if (!supported) return;

    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      // iOS ends the microphone track while an installed app is in the
      // background; reopen it, or the recorder hears nothing when the user returns.
      if (activeRef.current && streamRef.current?.getAudioTracks().some((t) => t.readyState === "ended")) {
        stopMeter();
        void startMeter();
      }
      forceRestart();
    };
    document.addEventListener("visibilitychange", onVisible);

    const watchdog = setInterval(() => {
      if (!activeRef.current) return;
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastEventRef.current > STT_WATCHDOG_MS) forceRestart();
    }, STT_WATCHDOG_MS / 2);

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(watchdog);
    };
  }, [supported, forceRestart, startMeter, stopMeter]);

  return { audioState, supported, permissionDenied, recognitionIssue, whisperAvailable, enable, disable };
}

// backward-compat alias
export const useWhisperSTT = useVoiceSTT;

// ─── TTS ─────────────────────────────────────────────────────────────────────

function stripMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, "code block")
    .replace(/`[^`]+`/g, (m) => m.slice(1, -1))
    .replace(/#{1,6}\s+/g, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^[-*+]\s+/gm, "")
    .replace(/^\d+\.\s+/gm, "")
    .replace(/\n{2,}/g, ". ")
    .replace(/\n/g, " ")
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F000}-\u{1F0FF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{FE00}-\u{FE0F}\u{1F1E6}-\u{1F1FF}\u{200D}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Cross-browser TTS hardening:
// - iOS Safari requires a user-gesture-initiated speak() before any TTS
//   works for the session. The previous unlock immediately cancel()ed the
//   warm-up utterance which silently kills the unlock itself.
// - iOS Safari often returns 0 voices for the first ~200ms; await
//   voiceschanged with a polling fallback (the event sometimes never fires).
// - Chrome kills long utterances after ~15s without activity; we pause +
//   resume every 10s while speaking to keep the queue alive.
// - Defensive cancel + resume before each speak to prevent the iOS
//   paused-after-cancel deadlock.

const isIOS = typeof navigator !== "undefined"
  && /iPad|iPhone|iPod/.test(navigator.userAgent)
  && !(window as any).MSStream;
const isChrome = typeof navigator !== "undefined"
  && /Chrome|CriOS/.test(navigator.userAgent);

let ttsUnlocked = false;

function unlockTTS() {
  if (ttsUnlocked || typeof window === "undefined" || !("speechSynthesis" in window)) return;
  try {
    const u = new SpeechSynthesisUtterance(" ");
    u.volume = 0;
    u.onend = () => { ttsUnlocked = true; };
    u.onerror = () => { ttsUnlocked = true; };
    window.speechSynthesis.speak(u);
  } catch { /* noop */ }
}

async function waitForVoices(timeoutMs = 1500): Promise<SpeechSynthesisVoice[]> {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return [];
  let voices = window.speechSynthesis.getVoices();
  if (voices.length > 0) return voices;
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      window.speechSynthesis.removeEventListener("voiceschanged", finish);
      resolve(window.speechSynthesis.getVoices());
    };
    window.speechSynthesis.addEventListener("voiceschanged", finish);
    const start = Date.now();
    const tick = () => {
      voices = window.speechSynthesis.getVoices();
      if (voices.length > 0 || Date.now() - start > timeoutMs) finish();
      else setTimeout(tick, 100);
    };
    tick();
  });
}

const TTS_KEY = "jarvis_tts_enabled_v2";

export function useTTS(voicePreference?: string) {
  const [speaking, setSpeaking] = useState(false);
  const [supported, setSupported] = useState(false);
  // Replies are text by default; reading them aloud is opt-in. A new key, so the
  // old always-on default stored for every earlier visitor doesn't carry over.
  const [enabled, setEnabled] = useState(false);
  const loaded = useRef(false);
  useEffect(() => {
    if (localStorage.getItem(TTS_KEY) === "true") setEnabled(true);
    loaded.current = true;
  }, []);
  const keepaliveRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const ok = typeof window !== "undefined" && "speechSynthesis" in window;
    setSupported(ok);
    if (!ok) return;
    window.speechSynthesis.getVoices();
    const arm = () => { unlockTTS(); };
    window.addEventListener("pointerdown", arm, { once: true });
    window.addEventListener("touchstart", arm, { once: true });
    window.addEventListener("keydown", arm, { once: true });
    return () => {
      window.removeEventListener("pointerdown", arm);
      window.removeEventListener("touchstart", arm);
      window.removeEventListener("keydown", arm);
    };
  }, []);

  useEffect(() => {
    if (loaded.current) localStorage.setItem(TTS_KEY, String(enabled));
  }, [enabled]);

  const startKeepalive = useCallback(() => {
    if (!isChrome || keepaliveRef.current) return;
    // 8s — Chrome's hard cap is ~15s of silence, so 8s gives plenty of margin
    // and survives throttled tabs that delay timers up to ~1.5×.
    keepaliveRef.current = setInterval(() => {
      if (!window.speechSynthesis.speaking) return;
      window.speechSynthesis.pause();
      window.speechSynthesis.resume();
    }, 8_000);
  }, []);

  const stopKeepalive = useCallback(() => {
    if (keepaliveRef.current) {
      clearInterval(keepaliveRef.current);
      keepaliveRef.current = null;
    }
  }, []);

  const speak = useCallback(async (text: string, onEnd?: () => void, force = false) => {
    if (!supported) { onEnd?.(); return; }
    if (!enabled && !force) { onEnd?.(); return; }   // force = one-shot Narrate, ignores the ambient toggle
    const clean = stripMarkdown(text);
    if (!clean.trim()) { onEnd?.(); return; }

    try { window.speechSynthesis.cancel(); } catch { /* noop */ }
    try { window.speechSynthesis.resume(); } catch { /* noop */ }
    // A cancelled utterance may never fire onend, which would leave the
    // "still speaking" marker set.
    if (ttsSpeaking()) lastSpoken.until = Date.now() + ECHO_TEXT_MS;

    // "Set volume" and "do not disturb" in the browser act on JARVIS's own voice.
    const w = window as Window & { __jarvisVolume?: number; __jarvisDnd?: boolean };
    if (w.__jarvisDnd && !force) { onEnd?.(); return; }
    const volume = typeof w.__jarvisVolume === "number" ? w.__jarvisVolume : 1;
    const started = () => {
      lastSpoken.text = clean;
      lastSpoken.startedAt = Date.now();
      lastSpoken.until = Infinity;
      setSpeaking(true);
    };
    let over = false;
    let watchdog: ReturnType<typeof setTimeout> | undefined;
    const finished = () => {
      if (over) return;
      over = true;
      clearTimeout(watchdog);
      if (lastSpoken.text === clean) lastSpoken.until = Date.now() + ECHO_TEXT_MS;
      setSpeaking(false);
      stopKeepalive();
      onEnd?.();
    };
    if (naturalVoiceOn() && (await speakNatural(clean, { volume, onStart: started, onEnd: finished }))) return;

    const voices = await waitForVoices(1500);
    const u = new SpeechSynthesisUtterance(clean);
    u.rate = isIOS ? 1.0 : 1.05;
    u.pitch = 0.9;
    u.volume = volume;
    const pattern = voicePreference ? new RegExp(voicePreference, "i") : /david|mark|google uk english male|daniel/i;
    const preferred =
      voices.find((v) => pattern.test(v.name)) ??
      voices.find((v) => v.lang?.startsWith("en") && /male/i.test(v.name)) ??
      voices.find((v) => v.lang === "en-US") ??
      voices.find((v) => v.lang?.startsWith("en")) ??
      voices[0];
    if (preferred) u.voice = preferred;

    // iOS can drop an utterance without onstart, or play it without onend.
    // Either leaves "speaking" set, the mic muted and call mode stuck after
    // one reply, so both are timed out.
    let begun = false;
    u.onstart = () => {
      begun = true;
      started();
      startKeepalive();
      clearTimeout(watchdog);
      watchdog = setTimeout(finished, clean.length * SPEECH_MS_PER_CHAR + SPEECH_END_GRACE_MS);
    };
    u.onend = finished;
    u.onerror = finished;

    setTimeout(() => {
      try { window.speechSynthesis.speak(u); } catch { finished(); return; }
      if (!begun) watchdog = setTimeout(finished, SPEECH_START_TIMEOUT_MS);
    }, isIOS ? 80 : 0);
  }, [enabled, supported, voicePreference, startKeepalive, stopKeepalive]);

  const stop = useCallback(() => {
    stopNatural();
    if (supported) {
      try { window.speechSynthesis.cancel(); } catch { /* noop */ }
    }
    if (ttsSpeaking()) lastSpoken.until = Date.now() + ECHO_TEXT_MS;
    stopKeepalive();
    setSpeaking(false);
  }, [supported, stopKeepalive]);

  const toggle = useCallback(() => {
    setEnabled((v) => {
      if (v && typeof window !== "undefined") {
        try { window.speechSynthesis?.cancel(); } catch { /* noop */ }
      }
      return !v;
    });
  }, []);

  return { speaking, enabled, supported, speak, stop, toggle };
}
