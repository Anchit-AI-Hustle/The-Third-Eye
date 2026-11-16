"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Mic, Square } from "lucide-react";
import { dictatable, insertDictation, type DictationField } from "@/lib/dictation";
import { startSpeechCapture, transcribeSpeechSegment, type SpeechCapture } from "@/lib/speechCapture";

type State = "idle" | "listening" | "transcribing";

/**
 * A mic beside whichever text field has focus, anywhere in the app. Speech is
 * gated before a segment is sent to transcription.
 */
export function DictationButton() {
  const [field, setField] = useState<DictationField | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [state, setState] = useState<State>("idle");
  const fieldRef = useRef<DictationField | null>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const captureRef = useRef<SpeechCapture | null>(null);
  const pendingRef = useRef(0);

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

  const startCapture = useCallback(async (el: DictationField) => {
    try {
      setState("listening");
      const capture = await startSpeechCapture({
        onSegment: async (audio) => {
          pendingRef.current++;
          setState("transcribing");
          try {
            const text = await transcribeSpeechSegment(audio, navigator.language || "en");
            if (text) insertDictation(el, text);
          } catch { /* preserve the field after a transient failure */ }
          finally {
            pendingRef.current--;
            if (captureRef.current) setState("listening");
            else if (pendingRef.current === 0) finish();
          }
        },
      });
      captureRef.current = capture;
      stopRef.current = () => {
        stopRef.current = null;
        captureRef.current = null;
        capture.stop();
        if (pendingRef.current === 0) finish();
        else setState("transcribing");
      };
    } catch { finish(); }
  }, [finish]);

  const toggle = useCallback(() => {
    if (stopRef.current) { stopRef.current(); return; }
    const el = fieldRef.current;
    if (!el || state !== "idle") return;
    void startCapture(el);
  }, [state, startCapture]);

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
