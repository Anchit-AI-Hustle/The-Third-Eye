"use client";

import { useCallback, useRef, useState } from "react";
import { putAudio } from "@/lib/lifelog/audioStore";
import type { LogSegment } from "@/lib/lifelog/types";

// Rolling day recorder: captures the mic in ~45s chunks, stores each chunk's
// audio in IndexedDB, and transcribes it via /api/transcribe (Groq/OpenAI
// Whisper cascade). Near-silent chunks skip transcription (no hallucinated
// text). Foreground only — browsers pause capture when the tab is backgrounded.

const CHUNK_MS = 45_000;
const SILENCE_PEAK = 0.012; // RMS/peak below this ≈ silence

export interface DayRecorder {
  recording: boolean;
  start: () => Promise<void>;
  stop: () => void;
  error: string | null;
  lastAt: number | null;
}

export function useDayRecorder(onSegment: (seg: LogSegment) => void): DayRecorder {
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastAt, setLastAt] = useState<number | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const acRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const peakRef = useRef(0);
  const activeRef = useRef(false);
  const chunkTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef = useRef(0);
  const onSegRef = useRef(onSegment);
  onSegRef.current = onSegment;

  const measure = useCallback(() => {
    const an = analyserRef.current;
    if (!an) return;
    const buf = new Uint8Array(an.fftSize);
    an.getByteTimeDomainData(buf);
    let peak = 0;
    for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs((buf[i] - 128) / 128));
    peakRef.current = Math.max(peakRef.current, peak);
    rafRef.current = requestAnimationFrame(measure);
  }, []);

  const runChunk = useCallback(() => {
    const stream = streamRef.current;
    if (!stream || !activeRef.current) return;
    const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((m) => MediaRecorder.isTypeSupported(m)) || "";
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    recRef.current = rec;
    const parts: Blob[] = [];
    const startTs = Date.now();
    peakRef.current = 0;
    rec.ondataavailable = (e) => { if (e.data.size) parts.push(e.data); };
    rec.onstop = async () => {
      const endTs = Date.now();
      const blob = new Blob(parts, { type: mime || "audio/webm" });
      const id = `${startTs}-${Math.round(peakRef.current * 1000)}`;
      const silent = peakRef.current < SILENCE_PEAK || blob.size < 2000;
      const seg: LogSegment = { id, startTs, endTs, transcript: "", hasAudio: false, silent };
      if (!silent) {
        void putAudio(id, blob).then((ok) => { if (ok) { seg.hasAudio = true; } });
        try {
          const fd = new FormData();
          fd.append("audio", blob, "chunk.webm");
          const res = await fetch("/api/transcribe", { method: "POST", body: fd });
          const d = await res.json().catch(() => ({}));
          if (res.ok && d.text) { seg.transcript = String(d.text).trim(); seg.provider = d.provider; }
        } catch { /* keep the segment without transcript */ }
      }
      seg.hasAudio = !silent;
      setLastAt(endTs);
      onSegRef.current(seg);
      if (activeRef.current) runChunk(); // roll into the next chunk
    };
    rec.start();
    chunkTimer.current = setTimeout(() => { if (rec.state !== "inactive") rec.stop(); }, CHUNK_MS);
  }, []);

  const start = useCallback(async () => {
    if (activeRef.current) return;
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      streamRef.current = stream;
      const AC = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext;
      const ac = new AC();
      acRef.current = ac;
      const src = ac.createMediaStreamSource(stream);
      const an = ac.createAnalyser();
      an.fftSize = 512;
      src.connect(an);
      analyserRef.current = an;
      activeRef.current = true;
      setRecording(true);
      rafRef.current = requestAnimationFrame(measure);
      runChunk();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Microphone permission denied.");
      activeRef.current = false;
      setRecording(false);
    }
  }, [measure, runChunk]);

  const stop = useCallback(() => {
    activeRef.current = false;
    setRecording(false);
    if (chunkTimer.current) clearTimeout(chunkTimer.current);
    cancelAnimationFrame(rafRef.current);
    try { if (recRef.current && recRef.current.state !== "inactive") recRef.current.stop(); } catch { /* noop */ }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    acRef.current?.close().catch(() => {});
    acRef.current = null;
  }, []);

  return { recording, start, stop, error, lastAt };
}
