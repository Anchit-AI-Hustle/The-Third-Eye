"use client";

import { useState, useRef, useCallback } from "react";
import { Video, Mic, Play, Pause, Upload, Loader2, Sparkles, Download, Volume2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface AvatarState {
  phase: "idle" | "recording" | "generating" | "playing";
  script: string;
  style: string;
  audioUrl?: string;
  videoUrl?: string;
}

const AVATAR_STYLES = [
  { id: "professional", label: "Professional", color: "#4FC3F7", icon: "👔" },
  { id: "casual", label: "Casual", color: "#34D399", icon: "😊" },
  { id: "anime", label: "Anime", color: "#F0C94E", icon: "✨" },
  { id: "realistic", label: "Realistic", color: "#A78BFA", icon: "🧑" },
];

export function VideoAvatar({ script = "", style = "professional" }: { script?: string; style?: string }) {
  const [state, setState] = useState<AvatarState>({
    phase: "idle",
    script,
    style,
  });
  const [audioLevel, setAudioLevel] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>(0);

  const startRecording = useCallback(() => {
    setState((s) => ({ ...s, phase: "recording" }));
    // Simulate audio level animation
    const animate = () => {
      setAudioLevel(Math.random() * 0.8 + 0.2);
      animFrameRef.current = requestAnimationFrame(animate);
    };
    animate();
  }, []);

  const stopRecording = useCallback(() => {
    cancelAnimationFrame(animFrameRef.current);
    setAudioLevel(0);
    setState((s) => ({ ...s, phase: "generating" }));
    // Simulate generation delay
    setTimeout(() => {
      setState((s) => ({ ...s, phase: "playing", audioUrl: "#", videoUrl: "#" }));
    }, 3000);
  }, []);

  const reset = useCallback(() => {
    cancelAnimationFrame(animFrameRef.current);
    setAudioLevel(0);
    setState({ phase: "idle", script, style });
  }, [script, style]);

  return (
    <div className="rounded-card border border-border-default bg-background-surface overflow-hidden">
      {/* Avatar display area */}
      <div className="relative aspect-video bg-gradient-to-br from-background-elevated to-background-base flex items-center justify-center overflow-hidden">
        {/* Animated background */}
        <div className="absolute inset-0">
          <div
            className="absolute inset-0 opacity-20 transition-opacity duration-500"
            style={{
              background: `radial-gradient(circle at 50% 50%, ${AVATAR_STYLES.find(s => s.id === state.style)?.color ?? "#4FC3F7"}40, transparent 70%)`,
              transform: `scale(${1 + audioLevel * 0.3})`,
            }}
          />
          {/* Grid pattern */}
          <svg className="absolute inset-0 w-full h-full opacity-5" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="currentColor" strokeWidth="0.5" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />
          </svg>
        </div>

        {/* Avatar silhouette */}
        <div className="relative z-10 flex flex-col items-center gap-3">
          <div
            className={cn(
              "w-24 h-24 rounded-full flex items-center justify-center text-4xl transition-all duration-300",
              state.phase === "recording" && "animate-pulse",
              state.phase === "generating" && "animate-spin",
              state.phase === "playing" && "animate-bounce"
            )}
            style={{
              background: `${AVATAR_STYLES.find(s => s.id === state.style)?.color ?? "#4FC3F7"}20`,
              border: `2px solid ${AVATAR_STYLES.find(s => s.id === state.style)?.color ?? "#4FC3F7"}40`,
              boxShadow: state.phase === "playing"
                ? `0 0 ${20 + audioLevel * 30}px ${AVATAR_STYLES.find(s => s.id === state.style)?.color ?? "#4FC3F7"}40`
                : "none",
            }}
          >
            {AVATAR_STYLES.find(s => s.id === state.style)?.icon ?? "🧑"}
          </div>

          {/* Waveform visualization */}
          {(state.phase === "recording" || state.phase === "playing") && (
            <div className="flex items-end gap-1 h-8">
              {Array.from({ length: 12 }).map((_, i) => (
                <div
                  key={i}
                  className="w-1 rounded-full transition-all duration-100"
                  style={{
                    height: `${Math.max(4, (Math.sin(Date.now() / 200 + i * 0.5) * 0.5 + 0.5) * audioLevel * 32)}px`,
                    backgroundColor: AVATAR_STYLES.find(s => s.id === state.style)?.color ?? "#4FC3F7",
                    opacity: 0.6 + audioLevel * 0.4,
                  }}
                />
              ))}
            </div>
          )}

          {/* Status text */}
          <div className="text-xs font-mono text-text-muted">
            {state.phase === "idle" && "Ready to generate"}
            {state.phase === "recording" && "Recording audio…"}
            {state.phase === "generating" && "Generating avatar video…"}
            {state.phase === "playing" && "Playing avatar video"}
          </div>
        </div>

        {/* Phase badge */}
        <div className="absolute top-3 right-3">
          <span className={cn(
            "px-2 py-0.5 rounded-input text-[10px] font-mono",
            state.phase === "idle" && "bg-text-muted/10 text-text-muted",
            state.phase === "recording" && "bg-accent-red/20 text-accent-red",
            state.phase === "generating" && "bg-accent-violet/20 text-accent-violet",
            state.phase === "playing" && "bg-success/20 text-success",
          )}>
            {state.phase === "recording" ? "● REC" : state.phase.toUpperCase()}
          </span>
        </div>
      </div>

      {/* Controls */}
      <div className="p-4 space-y-3">
        {/* Script preview */}
        {state.script && (
          <div className="text-xs text-text-secondary bg-background-elevated rounded-input p-3 line-clamp-3">
            <span className="text-text-muted font-mono">Script: </span>
            {state.script}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          {state.phase === "idle" && (
            <>
              <button
                onClick={startRecording}
                className="flex items-center gap-2 px-4 py-2 rounded-input bg-accent-blue/10 border border-accent-blue/30 text-accent-blue text-xs font-medium hover:bg-accent-blue/20 transition-colors"
              >
                <Mic size={14} /> Record Audio
              </button>
              <button className="flex items-center gap-2 px-4 py-2 rounded-input bg-background-elevated border border-border-default text-text-secondary text-xs font-medium hover:text-text-primary transition-colors">
                <Upload size={14} /> Upload Audio
              </button>
            </>
          )}
          {state.phase === "recording" && (
            <button
              onClick={stopRecording}
              className="flex items-center gap-2 px-4 py-2 rounded-input bg-accent-red/10 border border-accent-red/30 text-accent-red text-xs font-medium hover:bg-accent-red/20 transition-colors"
            >
              <Pause size={14} /> Stop Recording
            </button>
          )}
          {state.phase === "generating" && (
            <div className="flex items-center gap-2 px-4 py-2 rounded-input bg-accent-violet/10 border border-accent-violet/30 text-accent-violet text-xs font-medium">
              <Loader2 size={14} className="animate-spin" /> Generating…
            </div>
          )}
          {state.phase === "playing" && (
            <>
              <button className="flex items-center gap-2 px-4 py-2 rounded-input bg-success/10 border border-success/30 text-success text-xs font-medium">
                <Volume2 size={14} /> Playing
              </button>
              <button className="flex items-center gap-2 px-4 py-2 rounded-input bg-background-elevated border border-border-default text-text-secondary text-xs font-medium hover:text-text-primary transition-colors">
                <Download size={14} /> Download
              </button>
              <button
                onClick={reset}
                className="flex items-center gap-2 px-4 py-2 rounded-input bg-background-elevated border border-border-default text-text-muted text-xs font-medium hover:text-text-primary transition-colors"
              >
                Reset
              </button>
            </>
          )}
        </div>

        {/* Style selector */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-text-muted">Style:</span>
          {AVATAR_STYLES.map((s) => (
            <button
              key={s.id}
              onClick={() => setState((prev) => ({ ...prev, style: s.id }))}
              className={cn(
                "px-2 py-0.5 rounded-input text-[10px] font-mono transition-colors",
                state.style === s.id
                  ? "text-text-primary border border-border-default"
                  : "text-text-muted hover:text-text-secondary"
              )}
              style={state.style === s.id ? { borderColor: `${s.color}40`, color: s.color } : {}}
            >
              {s.icon} {s.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
