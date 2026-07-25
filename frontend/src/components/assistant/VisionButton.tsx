"use client";

import { useState, useRef, useEffect } from "react";
import { Eye, Monitor, Camera, Loader2 } from "lucide-react";

// Captures a single still frame from screen-share or the webcam, sends it (with
// the user's question) to /api/vision, and hands the result back to the
// assistant. Self-contained so it doesn't tangle the main chat flow.
export function VisionButton({
  question,
  disabled,
  onResult,
}: {
  question: string;
  disabled?: boolean;
  onResult: (question: string, image: string, answer: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<"screen" | "camera" | null>(null);
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    setSupported(typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia);
  }, []);

  async function grabFrame(kind: "screen" | "camera"): Promise<string | null> {
    const md = navigator.mediaDevices;
    const stream: MediaStream = kind === "screen"
      ? await (md as any).getDisplayMedia({ video: true })
      : await md.getUserMedia({ video: { facingMode: "environment" } });
    try {
      const video = document.createElement("video");
      video.srcObject = stream;
      video.muted = true;
      await video.play();
      // Give the pipeline a moment to render a real frame.
      await new Promise((r) => setTimeout(r, 350));
      const vw = video.videoWidth || 1280;
      const vh = video.videoHeight || 720;
      const w = Math.min(vw, 1280);
      const h = Math.round(vh * (w / vw));
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.drawImage(video, 0, 0, w, h);
      return canvas.toDataURL("image/jpeg", 0.8);
    } finally {
      stream.getTracks().forEach((t) => t.stop());
    }
  }

  async function analyze(kind: "screen" | "camera") {
    setOpen(false);
    setBusy(kind);
    try {
      const image = await grabFrame(kind);
      if (!image) throw new Error("Couldn't capture a frame");
      const q = question.trim() || "What do you see? Note anything important or actionable.";
      const res = await fetch("/api/vision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image, prompt: q }),
      });
      const data = await res.json().catch(() => ({}));
      const answer = res.ok ? (data.text || "(no description)") : `Couldn't analyze it — ${data.error || res.status}`;
      onResult(q, image, answer);
    } catch (e) {
      // User cancelled the share prompt, or capture failed — surface it softly.
      const msg = e instanceof Error ? e.message : String(e);
      if (!/Permission|denied|cancel|Abort/i.test(msg)) onResult(question, "", `Vision failed — ${msg}`);
    } finally {
      setBusy(null);
    }
  }

  if (!supported) return null;

  return (
    <div className="relative flex-none self-stretch flex items-center">
      {open && <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled || !!busy}
        title="Vision — show the assistant your screen or camera"
        className="flex-none p-1.5 rounded-input text-text-muted hover:text-accent-blue transition-colors disabled:opacity-40"
      >
        {busy ? <Loader2 size={15} className="animate-spin" /> : <Eye size={15} />}
      </button>
      {open && (
        <div className="absolute bottom-10 left-0 z-50 w-52 bg-background-elevated border border-border-default rounded-card shadow-xl p-1.5">
          <button type="button" onClick={() => analyze("screen")}
            className="flex w-full items-center gap-2.5 rounded-input px-2.5 py-2 text-left text-text-secondary hover:bg-background-surface hover:text-text-primary">
            <Monitor size={14} /><span><span className="block text-[13px] font-medium">Analyze screen</span><span className="block text-[11px] text-text-muted">Share a window/tab to analyze</span></span>
          </button>
          <button type="button" onClick={() => analyze("camera")}
            className="flex w-full items-center gap-2.5 rounded-input px-2.5 py-2 text-left text-text-secondary hover:bg-background-surface hover:text-text-primary">
            <Camera size={14} /><span><span className="block text-[13px] font-medium">Analyze camera</span><span className="block text-[11px] text-text-muted">Capture a webcam frame</span></span>
          </button>
          <p className="text-[10px] text-text-muted px-2.5 py-1.5 leading-snug">Type a question first to ask about the capture.</p>
        </div>
      )}
    </div>
  );
}
