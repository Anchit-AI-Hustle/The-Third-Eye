"use client";

import { useCallback, useRef, useState } from "react";
import { putAudio } from "@/lib/lifelog/audioStore";
import type { LogSegment } from "@/lib/lifelog/types";

// Rolling day recorder: captures the mic in ~45s chunks, stores each chunk's
// audio in IndexedDB, and transcribes it via /api/transcribe (Groq/OpenAI
// Whisper cascade). Near-silent chunks skip transcription (no hallucinated
// text). Recovers by itself when the mic drops or errors, until stop().

const CHUNK_MS = 45_000;
const SILENCE_PEAK = 0.012; // RMS/peak below this ≈ silence
const METER_MS = 200;
const RETRY_MIN_MS = 2_000;
const RETRY_MAX_MS = 30_000;

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
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const meterRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const backoffRef = useRef(RETRY_MIN_MS);
  const onSegRef = useRef(onSegment);
  onSegRef.current = onSegment;

  // An interval, not requestAnimationFrame: rAF stops in a background tab,
  // which would mark every background chunk silent and skip its transcript.
  const measure = useCallback(() => {
    const an = analyserRef.current;
    if (!an) return;
    if (acRef.current?.state === "suspended") void acRef.current.resume().catch(() => {});
    const buf = new Uint8Array(an.fftSize);
    an.getByteTimeDomainData(buf);
    let peak = 0;
    for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs((buf[i] - 128) / 128));
    peakRef.current = Math.max(peakRef.current, peak);
  }, []);

  const release = useCallback(() => {
    if (chunkTimer.current) clearTimeout(chunkTimer.current);
    if (meterRef.current) clearInterval(meterRef.current);
    meterRef.current = null;
    try { if (recRef.current && recRef.current.state !== "inactive") recRef.current.stop(); } catch { /* noop */ }
    streamRef.current?.getTracks().forEach((t) => { t.onended = null; t.stop(); });
    streamRef.current = null;
    acRef.current?.close().catch(() => {});
    acRef.current = null;
    analyserRef.current = null;
  }, []);

  const recoverRef = useRef<() => void>(() => {});

  const runChunk = useCallback(() => {
    const stream = streamRef.current;
    if (!stream || !activeRef.current) return;
    const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((m) => MediaRecorder.isTypeSupported(m)) || "";
    let rec: MediaRecorder;
    try { rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined); } catch { recoverRef.current(); return; }
    recRef.current = rec;
    const parts: Blob[] = [];
    const startTs = Date.now();
    peakRef.current = 0;
    rec.ondataavailable = (e) => { if (e.data.size) parts.push(e.data); };
    rec.onerror = () => recoverRef.current();
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
      if (activeRef.current && streamRef.current === stream) runChunk(); // roll into the next chunk
    };
    try { rec.start(); } catch { recoverRef.current(); return; }
    chunkTimer.current = setTimeout(() => { if (rec.state !== "inactive") rec.stop(); }, CHUNK_MS);
  }, []);

  const acquire = useCallback(async () => {
    if (!activeRef.current) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      if (!activeRef.current) { stream.getTracks().forEach((t) => t.stop()); return; }
      streamRef.current = stream;
      // The mic can drop out (another app took it, a headset was unplugged, the
      // OS interrupted): pick it straight back up.
      stream.getTracks().forEach((t) => { t.onended = () => recoverRef.current(); });
      const AC = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext;
      const ac = new AC();
      acRef.current = ac;
      const an = ac.createAnalyser();
      an.fftSize = 512;
      ac.createMediaStreamSource(stream).connect(an);
      analyserRef.current = an;
      meterRef.current = setInterval(measure, METER_MS);
      backoffRef.current = RETRY_MIN_MS;
      setError(null);
      runChunk();
    } catch (e) {
      const denied = e instanceof DOMException && (e.name === "NotAllowedError" || e.name === "SecurityError");
      setError(denied ? "Microphone permission is off. Allow it for this site to keep listening." : "The microphone isn't available right now. Retrying…");
      if (!denied) recoverRef.current();
      else { activeRef.current = false; setRecording(false); }
    }
  }, [measure, runChunk]);

  recoverRef.current = () => {
    if (!activeRef.current) return;
    release();
    if (retryTimer.current) clearTimeout(retryTimer.current);
    retryTimer.current = setTimeout(() => void acquire(), backoffRef.current);
    backoffRef.current = Math.min(backoffRef.current * 2, RETRY_MAX_MS);
  };

  const start = useCallback(async () => {
    if (activeRef.current) return;
    setError(null);
    activeRef.current = true;
    setRecording(true);
    await acquire();
  }, [acquire]);

  const stop = useCallback(() => {
    activeRef.current = false;
    setRecording(false);
    if (retryTimer.current) clearTimeout(retryTimer.current);
    release();
  }, [release]);

  return { recording, start, stop, error, lastAt };
}
