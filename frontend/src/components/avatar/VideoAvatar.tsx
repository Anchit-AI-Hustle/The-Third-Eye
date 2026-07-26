"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Play, Loader2, Sparkles, Download, Square, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { recordGeneration } from "@/lib/generations";

interface AvatarState {
  phase: "idle" | "recording" | "generating" | "playing" | "error";
  script: string;
  style: string;
  audioUrl?: string;
  videoUrl?: string;
  videoBlob?: Blob;
  error?: string;
}

const AVATAR_STYLES = [
  { id: "professional", label: "Professional", color: "#4FC3F7", icon: "👔" },
  { id: "casual", label: "Casual", color: "#34D399", icon: "😊" },
  { id: "anime", label: "Anime", color: "#F0C94E", icon: "✨" },
  { id: "realistic", label: "Realistic", color: "#A78BFA", icon: "🧑" },
];

const VIDEO_W = 1280;
const VIDEO_H = 720;
const FPS = 30;

/**
 * Render avatar animation frames onto a canvas and record them with audio
 * into a downloadable WebM video.
 */
async function renderAvatarVideo(
  script: string,
  style: string,
  onProgress?: (p: number) => void,
): Promise<Blob> {
  if (typeof window === "undefined") throw new Error("client only");
  if (typeof MediaRecorder === "undefined") throw new Error("This browser can't record video.");

  const AC = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext;
  if (!AC) throw new Error("This browser can't record audio.");

  const styleDef = AVATAR_STYLES.find((s) => s.id === style) ?? AVATAR_STYLES[0];

  // ── 1. Set up AudioContext with oscillator for audio track ──
  const audioCtx = new AC();
  const audioDest = audioCtx.createMediaStreamDestination();

  // Oscillator synced to animation — produces a gentle speech-like tone
  const osc = audioCtx.createOscillator();
  const gainNode = audioCtx.createGain();
  osc.type = "sine";
  osc.frequency.value = 220; // base frequency
  gainNode.gain.value = 0; // start silent, animate in draw()
  osc.connect(gainNode);
  gainNode.connect(audioDest);
  osc.start();

  // ── 2. Set up canvas + MediaRecorder with video + audio ──
  const canvas = document.createElement("canvas");
  canvas.width = VIDEO_W;
  canvas.height = VIDEO_H;
  const ctx = canvas.getContext("2d", { alpha: false })!;
  const canvasStream = canvas.captureStream(FPS);

  // Combine video + audio tracks
  const combinedStream = new MediaStream([
    ...canvasStream.getVideoTracks(),
    ...audioDest.stream.getAudioTracks(),
  ]);

  const mime = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"]
    .find((m) => MediaRecorder.isTypeSupported(m)) || "video/webm";
  
  const rec = new MediaRecorder(combinedStream, {
    mimeType: mime,
    videoBitsPerSecond: 6_000_000,
    audioBitsPerSecond: 128_000,
  });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  const finished = new Promise<Blob>((res) => {
    rec.onstop = () => res(new Blob(chunks, { type: "video/webm" }));
  });

  // ── 3. Animation state ──
  const color = styleDef.color;
  const icon = styleDef.icon;
  const W = VIDEO_W, H = VIDEO_H, cx = W / 2, cy = H / 2;
  let raf = 0;
  let frame = 0;
  const startTime = performance.now();
  // Estimate duration: ~150ms per word, min 3s, max 60s
  const wordCount = script.split(/\s+/).filter(Boolean).length;
  const durationMs = Math.min(Math.max(wordCount * 150, 3000), 60000);

  // Text wrapping for script display
  function wrapText(text: string, maxWidth: number, font: string): string[] {
    ctx.font = font;
    const words = text.split(/\s+/);
    const lines: string[] = [];
    let line = "";
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  // ── 4. Draw function ──
  const draw = () => {
    frame++;
    const elapsed = performance.now() - startTime;
    const progress = Math.min(1, elapsed / durationMs);

    if (onProgress) onProgress(progress);

    // Background gradient
    const bg = ctx.createRadialGradient(cx, cy * 0.8, 80, cx, cy, Math.max(W, H) * 0.8);
    bg.addColorStop(0, `${color}15`);
    bg.addColorStop(0.5, "#0A0A14");
    bg.addColorStop(1, "#05050C");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // Grid pattern
    ctx.strokeStyle = `${color}08`;
    ctx.lineWidth = 0.5;
    for (let x = 0; x < W; x += 40) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let y = 0; y < H; y += 40) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }

    // Breathing pulse (simulates speech rhythm)
    const breathe = Math.sin(frame * 0.08) * 0.5 + 0.5;
    const speechPulse = Math.sin(frame * 0.15) * 0.3 + 0.7;

    // Outer glow ring
    const ringRadius = 100 + breathe * 15;
    ctx.beginPath();
    ctx.arc(cx, cy * 0.75, ringRadius + 30, 0, Math.PI * 2);
    ctx.fillStyle = `${color}08`;
    ctx.fill();

    // Avatar circle
    const grad = ctx.createRadialGradient(cx, cy * 0.75, 0, cx, cy * 0.75, ringRadius);
    grad.addColorStop(0, `${color}30`);
    grad.addColorStop(0.7, `${color}15`);
    grad.addColorStop(1, `${color}05`);
    ctx.beginPath();
    ctx.arc(cx, cy * 0.75, ringRadius, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();

    // Border ring
    ctx.beginPath();
    ctx.arc(cx, cy * 0.75, ringRadius, 0, Math.PI * 2);
    ctx.strokeStyle = `${color}${Math.floor(40 + speechPulse * 60).toString(16).padStart(2, "0")}`;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Avatar icon/emoji
    ctx.font = `${60 + breathe * 10}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(icon, cx, cy * 0.75);

    // Pulsing dots around avatar (8 dots in a circle)
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2 + frame * 0.02;
      const dotR = ringRadius + 50 + Math.sin(frame * 0.1 + i) * 10;
      const dx = cx + Math.cos(angle) * dotR;
      const dy = cy * 0.75 + Math.sin(angle) * dotR;
      const dotSize = 3 + Math.sin(frame * 0.12 + i * 0.8) * 2;
      ctx.beginPath();
      ctx.arc(dx, dy, dotSize, 0, Math.PI * 2);
      ctx.fillStyle = `${color}${Math.floor(30 + speechPulse * 50).toString(16).padStart(2, "0")}`;
      ctx.fill();
    }

    // Waveform bar visualization at the bottom
    const barCount = 40;
    const barWidth = 6;
    const barGap = 4;
    const totalWidth = barCount * (barWidth + barGap);
    const startX = (W - totalWidth) / 2;
    const baseY = H - 120;
    for (let i = 0; i < barCount; i++) {
      const freq = Math.sin(frame * 0.1 + i * 0.3) * 0.5 + 0.5;
      const height = 8 + freq * speechPulse * 40;
      const x = startX + i * (barWidth + barGap);
      ctx.fillStyle = `${color}${Math.floor(40 + freq * 60).toString(16).padStart(2, "0")}`;
      ctx.beginPath();
      ctx.fillRect(x, baseY - height / 2, barWidth, height);
      ctx.fill();
    }

    // Script text (wrapped)
    const lines = wrapText(script, W - 160, "16px system-ui, -apple-system, sans-serif");
    const maxShowLines = 6;
    const shown = lines.slice(0, maxShowLines);
    const textY = H - 60 - (shown.length * 22);
    ctx.font = "16px system-ui, -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    shown.forEach((line, i) => {
      ctx.fillText(line.slice(0, 60) + (line.length > 60 ? "…" : ""), cx, textY + i * 22);
    });
    if (lines.length > maxShowLines) {
      ctx.fillText("…", cx, textY + maxShowLines * 22);
    }

    // Style label
    ctx.font = "12px monospace";
    ctx.textAlign = "left";
    ctx.fillStyle = `${color}80`;
    ctx.fillText(`${styleDef.label} avatar`, 24, 32);

    // Progress bar at bottom
    ctx.fillStyle = "#ffffff10";
    ctx.fillRect(0, H - 4, W, 4);
    ctx.fillStyle = `${color}80`;
    ctx.fillRect(0, H - 4, W * progress, 4);

    // Continue or finish
    if (progress < 1) {
      raf = requestAnimationFrame(draw);
    }
  };

  // ── 5. Record with audio ──
  try {
    ctx.fillStyle = "#05050C";
    ctx.fillRect(0, 0, W, H);
    rec.start();
    raf = requestAnimationFrame(draw);

    await new Promise<void>((res) => {
      const check = () => {
        const elapsed = performance.now() - startTime;
        const p = Math.min(1, elapsed / durationMs);
        // Animate oscillator frequency + gain to simulate speech rhythm
        const speechRhythm = Math.sin(elapsed * 0.006) * 0.5 + 0.5;
        osc.frequency.value = 180 + speechRhythm * 120;
        gainNode.gain.value = speechRhythm * 0.12; // audible but not harsh
        if (elapsed >= durationMs) return res();
        setTimeout(check, 50);
      };
      check();
    });
  } finally {
    cancelAnimationFrame(raf);
    try { osc.stop(); } catch { /* already stopped */ }
    try { await audioCtx.close(); } catch { /* noop */ }
    if (rec.state !== "inactive") rec.stop();
  }

  const videoBlob = await finished;
  return videoBlob;
}

export function VideoAvatar({ script = "", style = "professional" }: { script?: string; style?: string }) {
  const [state, setState] = useState<AvatarState>({
    phase: "idle",
    script,
    style,
  });
  const [progress, setProgress] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Load voices
  useEffect(() => {
    speechSynthesis.getVoices();
    speechSynthesis.onvoiceschanged = () => speechSynthesis.getVoices();
  }, []);

  const generate = useCallback(async () => {
    if (!state.script.trim()) return;
    setState((s) => ({ ...s, phase: "generating", error: undefined }));
    setProgress(0);
    try {
      const videoBlob = await renderAvatarVideo(state.script, state.style, setProgress);
      const videoUrl = URL.createObjectURL(videoBlob);
      setState((s) => ({ ...s, phase: "playing", videoUrl, videoBlob }));
      setProgress(0);

      // Record to generations
      recordGeneration({
        app: "avatar",
        appLabel: "Video Avatar Studio",
        title: `Avatar: ${state.script.slice(0, 60)}`,
        kind: "json",
        inputs: [
          { label: "Script", value: state.script.slice(0, 200) },
          { label: "Style", value: AVATAR_STYLES.find((s) => s.id === state.style)?.label ?? state.style },
        ],
        output: state.script,
        meta: { style: state.style, type: "avatar-video" },
      });
    } catch (e) {
      setState((s) => ({ ...s, phase: "error", error: e instanceof Error ? e.message : "Generation failed." }));
    }
  }, [state.script, state.style]);

  const playWithVoice = useCallback(() => {
    speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(state.script);
    utt.lang = "en-US";
    utt.rate = 1;
    const voices = speechSynthesis.getVoices();
    const preferred = voices.find((v) => v.lang.startsWith("en") && v.name.includes("Google"))
      || voices.find((v) => v.lang.startsWith("en"));
    if (preferred) utt.voice = preferred;
    speechSynthesis.speak(utt);

    // Also play the video
    if (videoRef.current) {
      videoRef.current.currentTime = 0;
      videoRef.current.play();
    }
  }, [state.script]);

  const stopVoice = useCallback(() => {
    speechSynthesis.cancel();
    if (videoRef.current) videoRef.current.pause();
  }, []);

  const download = useCallback(() => {
    if (!state.videoBlob) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(state.videoBlob);
    a.download = `avatar-${new Date().toISOString().slice(0, 10)}.webm`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, [state.videoBlob]);

  const reset = useCallback(() => {
    speechSynthesis.cancel();
    if (state.videoUrl) URL.revokeObjectURL(state.videoUrl);
    setState({ phase: "idle", script, style });
    setProgress(0);
  }, [script, style]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      speechSynthesis.cancel();
      // Revoke any blob URLs to prevent memory leaks
      setState((s) => {
        if (s.videoUrl) URL.revokeObjectURL(s.videoUrl);
        return s;
      });
    };
  }, []);

  const styleDef = AVATAR_STYLES.find((s) => s.id === state.style) ?? AVATAR_STYLES[0];

  return (
    <div className="rounded-card border border-border-default bg-background-surface overflow-hidden">
      {/* Video display area */}
      <div className="relative aspect-video bg-gradient-to-br from-background-elevated to-background-base flex items-center justify-center overflow-hidden">
        {state.phase === "playing" && state.videoUrl ? (
          <video
            ref={videoRef}
            src={state.videoUrl}
            className="w-full h-full object-contain bg-black"
            controls
            onEnded={() => {
              speechSynthesis.cancel();
            }}
          />
        ) : state.phase === "generating" ? (
          <div className="flex flex-col items-center gap-4">
            <div className="relative">
              <div className="w-24 h-24 rounded-full animate-pulse flex items-center justify-center text-4xl"
                style={{ background: `${styleDef.color}20`, border: `2px solid ${styleDef.color}40` }}>
                {styleDef.icon}
              </div>
              <Loader2 size={20} className="absolute -top-1 -right-1 animate-spin" style={{ color: styleDef.color }} />
            </div>
            <div className="text-center">
              <p className="text-sm text-text-secondary">Generating avatar video…</p>
              <div className="mt-2 w-48 h-1.5 bg-background-elevated rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-300" style={{ width: `${progress * 100}%`, background: styleDef.color }} />
              </div>
              <p className="text-[10px] font-mono text-text-muted mt-1">{Math.round(progress * 100)}%</p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <div className="w-24 h-24 rounded-full flex items-center justify-center text-4xl"
              style={{ background: `${styleDef.color}15`, border: `2px dashed ${styleDef.color}30` }}>
              {styleDef.icon}
            </div>
            <p className="text-sm text-text-muted">Enter a script and click "Generate avatar"</p>
            <p className="text-[11px] text-text-muted/60">Video preview — voice plays live via browser speech synthesis.</p>
          </div>
        )}

        {/* Phase badge */}
        <div className="absolute top-3 right-3">
          <span className={cn(
            "px-2 py-0.5 rounded-input text-[10px] font-mono",
            state.phase === "idle" && "bg-text-muted/10 text-text-muted",
            state.phase === "generating" && "bg-accent-violet/20 text-accent-violet",
            state.phase === "playing" && "bg-success/20 text-success",
            state.phase === "error" && "bg-accent-red/20 text-accent-red",
          )}>
            {state.phase.toUpperCase()}
          </span>
        </div>
      </div>

      {/* Controls */}
      <div className="p-4 space-y-3">
        {/* Script input */}
        <div>
          <label className="block text-xs font-mono text-text-secondary mb-1.5">
            What the avatar says <span className="text-accent-red">*</span>
          </label>
          <textarea
            value={state.script}
            onChange={(e) => setState((s) => ({ ...s, script: e.target.value }))}
            placeholder="Type the script for the avatar to speak…"
            rows={4}
            className="w-full bg-background-base border border-border-default rounded-input px-3 py-2 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-[var(--te-accent)] transition-colors resize-y"
            style={{ ["--te-accent" as string]: styleDef.color }}
          />
        </div>

        {/* Style selector */}
        <div>
          <label className="block text-xs font-mono text-text-secondary mb-1.5">Avatar style</label>
          <div className="flex gap-2">
            {AVATAR_STYLES.map((s) => (
              <button
                key={s.id}
                onClick={() => setState((prev) => ({ ...prev, style: s.id }))}
                className={cn(
                  "flex-1 px-3 py-2 rounded-input text-xs font-medium transition-all border",
                  state.style === s.id
                    ? "text-text-primary"
                    : "border-border-default text-text-muted hover:text-text-secondary hover:border-border-default/80"
                )}
                style={state.style === s.id ? { borderColor: `${s.color}60`, background: `${s.color}10`, color: s.color } : {}}
              >
                {s.icon} {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          {state.phase === "idle" || state.phase === "error" ? (
            <button
              onClick={generate}
              disabled={!state.script.trim()}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-input text-sm font-semibold text-[#07070F] hover:brightness-110 disabled:opacity-50 transition-all"
              style={{ background: styleDef.color }}
            >
              <Sparkles size={15} /> Generate avatar
            </button>
          ) : state.phase === "generating" ? (
            <button disabled className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-input text-sm font-semibold opacity-50" style={{ background: styleDef.color }}>
              <Loader2 size={15} className="animate-spin" /> Generating…
            </button>
          ) : (
            <>
              <button
                onClick={playWithVoice}
                className="flex items-center gap-2 px-4 py-2 rounded-input text-xs font-medium border transition-colors"
                style={{ borderColor: `${styleDef.color}40`, color: styleDef.color }}
              >
                <Play size={14} /> Play with voice
              </button>
              <button
                onClick={stopVoice}
                className="flex items-center gap-2 px-3 py-2 rounded-input text-xs font-medium border border-border-default text-text-muted hover:text-text-primary transition-colors"
              >
                <Square size={12} /> Stop
              </button>
              <button
                onClick={download}
                className="flex items-center gap-2 px-3 py-2 rounded-input text-xs font-medium border border-border-default text-text-secondary hover:text-text-primary transition-colors"
              >
                <Download size={12} /> .webm
              </button>
              <button
                onClick={reset}
                className="flex items-center gap-2 px-3 py-2 rounded-input text-xs font-medium border border-border-default text-text-muted hover:text-text-primary transition-colors"
              >
                <RefreshCw size={12} /> New
              </button>
            </>
          )}
        </div>

        {state.error && (
          <p className="text-xs text-accent-red">{state.error}</p>
        )}
      </div>
    </div>
  );
}
