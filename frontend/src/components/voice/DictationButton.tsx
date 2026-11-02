"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Mic, Square } from "lucide-react";
import { dictatable, insertDictation, type DictationField } from "@/lib/dictation";
import { speechRecognizer } from "@/lib/speechRecognizer";
import { downsample, encodeWav, PcmClip, TARGET_RATE } from "@/lib/pcmClip";

type State = "idle" | "listening" | "transcribing";

/**
 * A mic beside whichever text field has focus, anywhere in the app: tap,
 * speak, and the words land at the cursor. The browser's recognizer is used
 * where it works; elsewhere (iPhone apps, Firefox) the speech is recorded and
 * transcribed on the server.
 */
export function DictationButton() {
  const [field, setField] = useState<DictationField | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [state, setState] = useState<State>("idle");
  const fieldRef = useRef<DictationField | null>(null);
  const stopRef = useRef<(() => void) | null>(null);

  const place = useCallback(() => {
    const el = fieldRef.current;
    if (!el || !el.isConnected) { setPos(null); return; }
    const r = el.getBoundingClientRect();
    if (!r.width || r.bottom < 0 || r.top > window.innerHeight) { setPos(null); return; }
    const size = 28;
    const top = el instanceof HTMLTextAreaElement ? r.bottom - size - 6 : r.top + (r.height - size) / 2;
    setPos({ top, left: Math.max(4, r.right - size - 6) });
  }, []);

  useEffect(() => {
    const onFocus = (e: FocusEvent) => {
      if (!dictatable(e.target)) return;
      if (fieldRef.current !== e.target) stopRef.current?.();
      fieldRef.current = e.target;
      setField(e.target);
      place();
    };
    const onBlur = () => {
      // Focus moving to the mic itself keeps the field.
      setTimeout(() => {
        if (document.activeElement === fieldRef.current || stopRef.current) return;
        fieldRef.current = null;
        setField(null);
      }, 150);
    };
    document.addEventListener("focusin", onFocus);
    document.addEventListener("focusout", onBlur);
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      document.removeEventListener("focusin", onFocus);
      document.removeEventListener("focusout", onBlur);
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
      stopRef.current?.();
    };
  }, [place]);

  const finish = useCallback(() => {
    stopRef.current = null;
    setState("idle");
    fieldRef.current?.focus();
  }, []);

  const withRecognizer = useCallback((Rec: any, el: DictationField) => {
    const rec = new Rec();
    rec.lang = navigator.language || "en-US";
    rec.continuous = true;
    rec.interimResults = false;
    rec.onresult = (e: any) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) insertDictation(el, e.results[i][0].transcript);
      }
    };
    rec.onend = finish;
    rec.onerror = finish;
    stopRef.current = () => { try { rec.stop(); } catch { finish(); } };
    rec.start();
    setState("listening");
  }, [finish]);

  const withRecorder = useCallback(async (el: DictationField) => {
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
    } catch { finish(); return; }
    const ctx = new AudioContext();
    const source = ctx.createMediaStreamSource(stream);
    const tap = ctx.createScriptProcessor(4096, 1, 1);
    const clip = new PcmClip(ctx.sampleRate, 0);
    clip.start();
    tap.onaudioprocess = (e) => clip.push(new Float32Array(e.inputBuffer.getChannelData(0)));
    source.connect(tap);
    tap.connect(ctx.destination);
    setState("listening");
    stopRef.current = async () => {
      stopRef.current = null;
      tap.onaudioprocess = null;
      source.disconnect();
      tap.disconnect();
      stream.getTracks().forEach((t) => t.stop());
      const wav = encodeWav(downsample(clip.stop(), ctx.sampleRate, TARGET_RATE), TARGET_RATE);
      void ctx.close();
      setState("transcribing");
      try {
        const fd = new FormData();
        fd.append("audio", wav, "speech.wav");
        fd.append("lang", navigator.language || "en");
        const res = await fetch("/api/transcribe", { method: "POST", body: fd, signal: AbortSignal.timeout(25_000) });
        const text = res.ok ? String((await res.json().catch(() => ({})))?.text ?? "") : "";
        if (text) insertDictation(el, text);
      } catch { /* nothing heard or offline: the field stays as it was */ }
      finish();
    };
  }, [finish]);

  const toggle = useCallback(() => {
    if (stopRef.current) { stopRef.current(); return; }
    const el = fieldRef.current;
    if (!el || state !== "idle") return;
    const Rec = speechRecognizer();
    if (Rec) withRecognizer(Rec, el);
    else void withRecorder(el);
  }, [state, withRecognizer, withRecorder]);

  if (!field || !pos) return null;
  const label = state === "listening" ? "Stop dictation" : state === "transcribing" ? "Transcribing" : "Dictate into this field";
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      // Keeps focus (and the cursor position) in the field.
      onMouseDown={(e) => e.preventDefault()}
      onPointerDown={(e) => e.preventDefault()}
      onClick={toggle}
      style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 60 }}
      className={`flex h-7 w-7 items-center justify-center rounded-full border transition-colors ${
        state === "listening"
          ? "border-accent-red/60 bg-accent-red/20 text-accent-red animate-pulse"
          : "border-border-default bg-background-elevated/95 text-text-muted hover:text-accent-blue"
      }`}
    >
      {state === "listening" ? <Square className="h-3 w-3" /> : state === "transcribing" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mic className="h-3.5 w-3.5" />}
    </button>
  );
}
