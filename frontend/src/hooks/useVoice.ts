"use client";

import { useState, useRef, useCallback, useEffect } from "react";

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
const SILENCE_MS = 700;
const BARGE_HOLD_MS = 280;

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
  stream: MediaStream,
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
  if (typeof MediaRecorder === "undefined") return () => {};
  const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((m) => MediaRecorder.isTypeSupported?.(m)) || "";
  let raf = 0;
  let rec: MediaRecorder | null = null;
  let parts: Blob[] = [];
  let voiced = false;
  let silenceAt = 0;
  let stopped = false;
  let holdUntil = 0;
  let barged = false;

  const drop = () => {
    parts = [];
    if (rec && rec.state === "recording") {
      rec.onstop = null;
      try { rec.stop(); } catch { /* already stopped */ }
    }
    rec = null;
    voiced = false;
    silenceAt = 0;
  };

  const flush = async (blob: Blob) => {
    if (stopped || blob.size < 400 || skip()) return;
    onTranscribing();
    try {
      const fd = new FormData();
      fd.append("audio", blob, mime.includes("mp4") ? "speech.mp4" : "speech.webm");
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
    if (rec && rec.state === "recording") return;
    parts = [];
    try {
      rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    } catch {
      return;
    }
    rec.ondataavailable = (e) => { if (e.data.size) parts.push(e.data); };
    rec.onstop = () => {
      const blob = new Blob(parts, { type: mime || "audio/webm" });
      parts = [];
      void flush(blob);
    };
    try { rec.start(250); } catch { rec = null; }
  };

  const end = () => {
    if (rec && rec.state === "recording") {
      try { rec.stop(); } catch { /* noop */ }
    }
    voiced = false;
    silenceAt = 0;
  };

  const time = new Uint8Array(analyser.fftSize);
  const tick = () => {
    if (stopped || !active()) return;
    analyser.getByteTimeDomainData(time);
    const peak = pcmPeak(time);
    const quiet = suppressed();
    if (peak >= (quiet ? BARGE_PEAK : SPEECH_PEAK)) {
      if (quiet && !barged) {
        barged = true;
        onBarge();
        drop();
        holdUntil = Date.now() + BARGE_HOLD_MS;
      }
      if (!suppressed() && Date.now() >= holdUntil) {
        if (!voiced) { voiced = true; begin(); }
        silenceAt = 0;
      }
    } else {
      barged = false;
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
    const SR = typeof window !== "undefined"
      ? (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition
      : null;
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

  const startMeter = useCallback(async () => {
    if (streamRef.current) return;
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
        return;
      }
      streamRef.current = stream;
      const ctx = new AudioContext();
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
        stream,
        analyser,
        () => activeRef.current,
        () => !!cbRef.current.shouldSuppress?.(),
        () => cbRef.current.lang,
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
    const SRClass = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    const canMic = typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
    if (!SRClass && !canMic) return;
    activeRef.current = true;
    setPermissionDenied(false);
    setRecognitionIssue(null);
    lastEventRef.current = Date.now();
    srDelayRef.current = 150;
    // Mid-conversation the screen must not sleep, or the mic is suspended.
    wakeLock.acquire();

    // Open the capture stream before the browser recognizer. Starting
    // SpeechRecognition first, then getUserMedia, leaves Chrome's recognizer
    // with a dead mic: it stays on "listening" and never returns words.
    await startMeter();
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
          setPermissionDenied(true);
          activeRef.current = false;
          setAudioState("idle");
          return;
        }
        if (e.error === "network" || e.error === "audio-capture") {
          setRecognitionIssue(e.error);
          // Restarting immediately on a dead speech service hammers it and
          // steals the mic from the recorder that is supposed to take over.
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
  }, [startMeter, wakeLock]);

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
      if (document.visibilityState === "visible") forceRestart();
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
  }, [supported, forceRestart]);

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

export function useTTS(voicePreference?: string) {
  const [speaking, setSpeaking] = useState(false);
  const [supported, setSupported] = useState(false);
  const [enabled, setEnabled] = useState(() => {
    if (typeof window === "undefined") return true;
    const v = localStorage.getItem("jarvis_tts_enabled");
    return v === null ? true : v === "true";
  });
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
    if (typeof window !== "undefined") localStorage.setItem("jarvis_tts_enabled", String(enabled));
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

    const voices = await waitForVoices(1500);
    const u = new SpeechSynthesisUtterance(clean);
    u.rate = isIOS ? 1.0 : 1.05;
    u.pitch = 0.9;
    u.volume = 1;
    const pattern = voicePreference ? new RegExp(voicePreference, "i") : /david|mark|google uk english male|daniel/i;
    const preferred =
      voices.find((v) => pattern.test(v.name)) ??
      voices.find((v) => v.lang?.startsWith("en") && /male/i.test(v.name)) ??
      voices.find((v) => v.lang === "en-US") ??
      voices.find((v) => v.lang?.startsWith("en")) ??
      voices[0];
    if (preferred) u.voice = preferred;

    u.onstart = () => { setSpeaking(true); startKeepalive(); };
    const finish = () => { setSpeaking(false); stopKeepalive(); onEnd?.(); };
    u.onend = finish;
    u.onerror = finish;

    setTimeout(() => {
      try { window.speechSynthesis.speak(u); } catch { finish(); }
    }, isIOS ? 80 : 0);
  }, [enabled, supported, voicePreference, startKeepalive, stopKeepalive]);

  const stop = useCallback(() => {
    if (supported) {
      try { window.speechSynthesis.cancel(); } catch { /* noop */ }
    }
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
