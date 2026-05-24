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
    .trim();
}

export function useTTS(voicePreference?: string) {
  const [speaking, setSpeaking] = useState(false);
  const [supported, setSupported] = useState(false);
  const [enabled, setEnabled] = useState(() => {
    if (typeof window === "undefined") return true;
    const v = localStorage.getItem("jarvis_tts_enabled");
    return v === null ? true : v === "true";
  });

  useEffect(() => {
    const ok = typeof window !== "undefined" && "speechSynthesis" in window;
    setSupported(ok);
    if (ok) {
      window.speechSynthesis.getVoices();
      window.speechSynthesis.addEventListener("voiceschanged", () => window.speechSynthesis.getVoices());
    }
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem("jarvis_tts_enabled", String(enabled));
  }, [enabled]);

  const speak = useCallback((text: string, onEnd?: () => void) => {
    if (!supported) { onEnd?.(); return; }
    window.speechSynthesis.cancel();
    if (!enabled) { onEnd?.(); return; }
    const clean = stripMarkdown(text);
    if (!clean.trim()) { onEnd?.(); return; }
    const u = new SpeechSynthesisUtterance(clean);
    u.rate = 1.05; u.pitch = 0.9; u.volume = 1;
    const voices = window.speechSynthesis.getVoices();
    const pattern = voicePreference ? new RegExp(voicePreference, "i") : /david|mark|google uk english male|daniel/i;
    const preferred =
      voices.find((v) => pattern.test(v.name)) ??
      voices.find((v) => v.lang.startsWith("en") && /male/i.test(v.name)) ??
      voices.find((v) => v.lang === "en-US");
    if (preferred) u.voice = preferred;
    u.onstart = () => setSpeaking(true);
    u.onend = () => { setSpeaking(false); onEnd?.(); };
    u.onerror = () => { setSpeaking(false); onEnd?.(); };
    window.speechSynthesis.speak(u);
  }, [enabled, supported]);

  const stop = useCallback(() => {
    if (supported) window.speechSynthesis.cancel();
    setSpeaking(false);
  }, [supported]);

  const toggle = useCallback(() => {
    setEnabled((v) => { if (v) window.speechSynthesis?.cancel(); return !v; });
  }, []);

  return { speaking, enabled, supported, speak, stop, toggle };
}
