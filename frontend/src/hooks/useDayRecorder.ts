"use client";

import { useCallback, useRef, useState } from "react";
import { putAudio } from "@/lib/lifelog/audioStore";
import type { LogSegment } from "@/lib/lifelog/types";
import { startSpeechCapture, transcribeSpeechSegment, type SpeechCapture } from "@/lib/speechCapture";

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
  const captureRef = useRef<SpeechCapture | null>(null);
  const activeRef = useRef(false);
  const segmentStartRef = useRef<number | null>(null);
  const onSegmentRef = useRef(onSegment);
  onSegmentRef.current = onSegment;

  const stop = useCallback(() => {
    if (!activeRef.current) return;
    activeRef.current = false;
    setRecording(false);
    captureRef.current?.stop();
    captureRef.current = null;
  }, []);

  const start = useCallback(async () => {
    if (activeRef.current) return;
    activeRef.current = true;
    setError(null);
    try {
      const openCapture = async (): Promise<void> => {
        const capture = await startSpeechCapture({
          onSpeechStart: () => { segmentStartRef.current = Date.now(); },
          onSegment: async (audio) => {
            const endTs = Date.now();
            const startTs = segmentStartRef.current ?? endTs;
            segmentStartRef.current = null;
            const id = `${startTs}-${crypto.randomUUID()}`;
            const seg: LogSegment = { id, startTs, endTs, transcript: "", hasAudio: false, silent: false };
            const [saved, transcript] = await Promise.all([
              putAudio(id, audio).catch(() => false),
              transcribeSpeechSegment(audio, "en-US").catch(() => ""),
            ]);
            seg.hasAudio = saved;
            seg.transcript = transcript;
            setLastAt(endTs);
            onSegmentRef.current(seg);
          },
          onTrackEnded: () => {
            captureRef.current = null;
            if (activeRef.current) void openCapture().catch((cause) => {
              setError(cause instanceof Error ? cause.message : "Microphone connection lost.");
              stop();
            });
          },
        });
        if (!activeRef.current) capture.stop();
        else {
          captureRef.current = capture;
          setRecording(true);
        }
      };
      await openCapture();
    } catch (cause) {
      activeRef.current = false;
      setRecording(false);
      setError(cause instanceof Error ? cause.message : "Microphone permission denied.");
    }
  }, [stop]);

  return { recording, start, stop, error, lastAt };
}
