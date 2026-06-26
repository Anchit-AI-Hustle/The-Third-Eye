"use client";

import { useState, useRef, useCallback, useEffect } from "react";

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

export function useVoiceSTT(cb: VoiceSTTCallbacks) {
  const [audioState, setAudioState] = useState<AudioState>("idle");
  const [supported, setSupported] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [whisperAvailable, setWhisperAvailable] = useState<boolean | null>(null);

  const activeRef = useRef(false);
  const cbRef = useRef(cb);
  useEffect(() => { cbRef.current = cb; }, [cb]);

  const recRef = useRef<any>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const SR = typeof window !== "undefined"
      ? (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition
      : null;
    setSupported(!!SR && !!navigator?.mediaDevices?.getUserMedia);

    // Check Whisper (200 = available + key set, 503 = no key)
    fetch("/api/transcribe", { method: "POST", body: new FormData() })
      .then((r) => setWhisperAvailable(r.status === 200))
      .catch(() => setWhisperAvailable(false));
  }, []);

  const startMeter = useCallback(async () => {
    if (streamRef.current) return;
    // On touch devices (iOS Safari, mobile Chrome), calling getUserMedia
    // here on top of SpeechRecognition's implicit mic acquisition produces
    // a second permission prompt. Skip the visualisation stream on mobile;
    // we emit a synthetic level instead so the existing UI doesn't break.
    const isTouch = typeof window !== "undefined"
      && (window.matchMedia?.("(pointer: coarse)").matches
        || /iPad|iPhone|iPod|Android/i.test(navigator.userAgent));
    if (isTouch) {
      const tick = () => {
        if (!activeRef.current) return;
        // Pulse 25..65 while listening so the bars animate without a real stream.
        const level = 25 + Math.round(Math.sin(Date.now() / 200) * 20 + 20);
        cbRef.current.onLevel?.(level);
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      streamRef.current = stream;
      const ctx = new AudioContext();
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      src.connect(analyser);
      audioCtxRef.current = ctx;
      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        if (!activeRef.current) return;
        analyser.getByteFrequencyData(data);
        const level = Math.round((data.reduce((s, v) => s + v, 0) / data.length / 255) * 100);
        cbRef.current.onLevel?.(level);
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch { /* mic permission handled by SpeechRecognition */ }
  }, []);

  const stopMeter = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    audioCtxRef.current?.close().catch(() => {});
    streamRef.current = null;
    audioCtxRef.current = null;
    cbRef.current.onLevel?.(0);
  }, []);

  const enable = useCallback(async () => {
    if (!supported || activeRef.current) return;
    activeRef.current = true;
    setPermissionDenied(false);

    const SRClass = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    if (!SRClass) { activeRef.current = false; return; }

    const startRec = () => {
      if (!activeRef.current) return;
      const rec = new SRClass();
      recRef.current = rec;
      rec.continuous = true;
      rec.interimResults = true;
      rec.maxAlternatives = 1;
      rec.lang = cbRef.current.lang || "";

      rec.onstart = () => setAudioState("waiting");

      rec.onspeechstart = () => {
        if (cbRef.current.shouldSuppress?.()) return;
        cbRef.current.onSpeechStart?.();
        setAudioState("speaking");
      };

      rec.onspeechend = () => {
        cbRef.current.onSpeechEnd?.();
        setAudioState("transcribing");
      };

      rec.onresult = (event: any) => {
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
        if (interim.trim()) cbRef.current.onInterim?.(interim.trim());
        if (final.trim()) {
          cbRef.current.onTranscript(final.trim());
          cbRef.current.onInterim?.("");
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
        setAudioState("waiting");
        // no-speech / network: let onend restart
      };

      rec.onend = () => {
        if (!activeRef.current) { setAudioState("idle"); return; }
        setTimeout(startRec, 150);
      };

      try { rec.start(); } catch { setTimeout(startRec, 500); }
    };

    startRec();
    startMeter();
  }, [supported, startMeter]);

  const disable = useCallback(() => {
    activeRef.current = false;
    try { recRef.current?.abort(); } catch {}
    recRef.current = null;
    stopMeter();
    setAudioState("idle");
  }, [stopMeter]);

  return { audioState, supported, permissionDenied, whisperAvailable, enable, disable };
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
