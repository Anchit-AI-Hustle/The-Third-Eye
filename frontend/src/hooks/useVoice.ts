"use client";

import { useState, useRef, useCallback, useEffect } from "react";

export type VoiceMode = "off" | "listening" | "busy";
export type AudioState = "idle" | "waiting" | "speaking" | "transcribing";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getBestMimeType(): string {
  const types = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
  return types.find((t) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) ?? "audio/webm";
}

const SPEECH_THRESHOLD = 14;   // avg frequency energy (0-255) above = speech
const SILENCE_DURATION = 1400; // ms of silence after speech → send to Whisper
const MIN_AUDIO_MS = 300;      // ignore clips shorter than this

// ─── Whisper VAD STT ─────────────────────────────────────────────────────────

export interface WhisperSTTCallbacks {
  onTranscript: (text: string) => void;
  onLevel?: (level: number) => void;
  onSpeechStart?: () => void;
  onSpeechEnd?: () => void;
  onTranscribing?: () => void;
  lang?: string;
}

export function useWhisperSTT(cb: WhisperSTTCallbacks) {
  const [audioState, setAudioState] = useState<AudioState>("idle");
  const [supported, setSupported] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [whisperAvailable, setWhisperAvailable] = useState<boolean | null>(null);

  const activeRef = useRef(false);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const silenceStartRef = useRef<number | null>(null);
  const hasSpeechRef = useRef(false);
  const recordingStartRef = useRef(0);
  const cbRef = useRef(cb);
  useEffect(() => { cbRef.current = cb; }, [cb]);

  useEffect(() => {
    setSupported(
      typeof window !== "undefined" &&
      !!navigator?.mediaDevices?.getUserMedia &&
      typeof MediaRecorder !== "undefined" &&
      typeof AudioContext !== "undefined"
    );
    fetch("/api/transcribe", { method: "POST", body: new FormData() })
      .then((r) => setWhisperAvailable(r.status !== 404))
      .catch(() => setWhisperAvailable(false));
  }, []);

  const sendToWhisper = useCallback(async (chunks: Blob[], mimeType: string) => {
    setAudioState("transcribing");
    cbRef.current.onTranscribing?.();
    const blob = new Blob(chunks, { type: mimeType });
    try {
      const fd = new FormData();
      fd.append("audio", blob, "audio.webm");
      if (cbRef.current.lang) fd.append("lang", cbRef.current.lang);
      const res = await fetch("/api/transcribe", { method: "POST", body: fd });
      const data = await res.json();
      if (data.text?.trim()) cbRef.current.onTranscript(data.text.trim());
    } catch { /* ignore */ }
  }, []);

  const startCycle = useCallback(async () => {
    if (!activeRef.current || !streamRef.current || !analyserRef.current) return;

    chunksRef.current = [];
    silenceStartRef.current = null;
    hasSpeechRef.current = false;
    recordingStartRef.current = Date.now();

    const mimeType = getBestMimeType();
    const recorder = new MediaRecorder(streamRef.current, { mimeType, audioBitsPerSecond: 16000 });
    recorderRef.current = recorder;
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    recorder.start(100);
    setAudioState("waiting");

    const analyser = analyserRef.current;
    const dataArr = new Uint8Array(analyser.frequencyBinCount);

    const tick = async () => {
      if (!activeRef.current) return;
      analyser.getByteFrequencyData(dataArr);
      const level = Math.round((dataArr.reduce((s, v) => s + v, 0) / dataArr.length / 255) * 100);
      cbRef.current.onLevel?.(level);

      const isSpeaking = level > SPEECH_THRESHOLD;

      if (isSpeaking) {
        if (!hasSpeechRef.current) {
          hasSpeechRef.current = true;
          cbRef.current.onSpeechStart?.();
        }
        silenceStartRef.current = null;
        setAudioState("speaking");
      } else if (hasSpeechRef.current) {
        if (!silenceStartRef.current) silenceStartRef.current = Date.now();
        if (Date.now() - silenceStartRef.current >= SILENCE_DURATION) {
          if (rafRef.current) cancelAnimationFrame(rafRef.current);
          recorder.stop();
          cbRef.current.onSpeechEnd?.();
          const elapsed = Date.now() - recordingStartRef.current;
          if (elapsed >= MIN_AUDIO_MS) {
            await sendToWhisper([...chunksRef.current], mimeType);
          }
          startCycle();
          return;
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
  }, [sendToWhisper]);

  const enable = useCallback(async () => {
    if (!supported || activeRef.current) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 16000 },
      });
      streamRef.current = stream;
      const audioCtx = new AudioContext({ sampleRate: 16000 });
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      audioCtxRef.current = audioCtx;
      analyserRef.current = analyser;
      activeRef.current = true;
      setPermissionDenied(false);
      startCycle();
    } catch (err: any) {
      if (err?.name === "NotAllowedError") setPermissionDenied(true);
    }
  }, [supported, startCycle]);

  const disable = useCallback(() => {
    activeRef.current = false;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    try { recorderRef.current?.stop(); } catch {}
    streamRef.current?.getTracks().forEach((t) => t.stop());
    audioCtxRef.current?.close().catch(() => {});
    streamRef.current = null;
    recorderRef.current = null;
    audioCtxRef.current = null;
    analyserRef.current = null;
    setAudioState("idle");
    cbRef.current.onLevel?.(0);
  }, []);

  return { audioState, supported, permissionDenied, whisperAvailable, enable, disable };
}

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

export function useTTS() {
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
    const preferred =
      voices.find((v) => /david|mark|google uk english male|daniel/i.test(v.name)) ??
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
