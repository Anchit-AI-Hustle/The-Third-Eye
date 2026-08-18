"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useSession } from "next-auth/react";
import { usePathname, useRouter } from "next/navigation";
import { Mic, MicOff, Volume2, VolumeX, ChevronDown, ExternalLink, X } from "lucide-react";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import { useVoiceSTT, useTTS } from "@/hooks/useVoice";

interface Turn {
  role: "user" | "assistant";
  content: string;
}

export function VoiceWidget() {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();

  const [expanded, setExpanded] = useState(false);
  const [micOn, setMicOn] = useState(false);
  const [liveBubble, setLiveBubble] = useState<{ text?: string; level: number } | null>(null);
  const [lastTurn, setLastTurn] = useState<{ user: string; assistant: string } | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);

  const suppressRef = useRef(false);
  const cooldownRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isStreamingRef = useRef(false);
  const sendRef = useRef<(text: string) => void>(() => {});
  const memoryRef = useRef<Record<string, string>>({});
  const historyRef = useRef<Turn[]>([]);

  // Don't render on the assistant page — it has its own voice UI
  const hidden = pathname?.startsWith("/assistant") || pathname?.startsWith("/auth");

  const tts = useTTS();

  const stt = useVoiceSTT({
    shouldSuppress: useCallback(() => suppressRef.current, []),
    onLevel: useCallback((l: number) => {
      setLiveBubble((p) => p ? { ...p, level: l } : null);
    }, []),
    onSpeechStart: useCallback(() => {
      setLiveBubble({ level: 0 });
      setExpanded(true);
    }, []),
    onInterim: useCallback((text: string) => {
      setLiveBubble((p) => ({ level: p?.level ?? 0, text }));
    }, []),
    onTranscript: useCallback((text: string) => {
      setLiveBubble(null);
      if (!isStreamingRef.current) sendRef.current(text);
    }, []),
  });

  // Echo suppression
  useEffect(() => {
    if (tts.speaking) {
      if (cooldownRef.current) clearTimeout(cooldownRef.current);
      suppressRef.current = true;
    } else {
      cooldownRef.current = setTimeout(() => { suppressRef.current = false; }, 800);
    }
  }, [tts.speaking]);

  useEffect(() => { isStreamingRef.current = isStreaming; }, [isStreaming]);

  // Load persistent memory on session ready
  useEffect(() => {
    const email = session?.user?.email;
    if (!email) return;
    try {
      const saved = JSON.parse(localStorage.getItem(`jarvis_memory_v1_${email}`) ?? "{}");
      memoryRef.current = saved;
    } catch {}
  }, [session?.user?.email]);

  const send = useCallback(async (text: string) => {
    if (isStreamingRef.current) return;
    isStreamingRef.current = true;
    setIsStreaming(true);
    setLastTurn({ user: text, assistant: "" });
    setExpanded(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          history: historyRef.current.slice(-4).map((t) => ({ role: t.role === "assistant" ? "assistant" : "user", content: t.content })),
          memory: memoryRef.current,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          userName: session?.user?.name?.split(" ")[0],
          email: session?.user?.email ?? undefined,
          accessToken: (session as any)?.accessToken ?? undefined,
        }),
      });

      if (!res.ok || !res.body) return;

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let fullText = "";
      let eventType = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (line.startsWith("event: ")) { eventType = line.slice(7).trim(); continue; }
          if (line.startsWith("data: ")) {
            try {
              const parsed = JSON.parse(line.slice(6));
              if (eventType === "text" && parsed.text) {
                fullText += parsed.text;
                setLastTurn({ user: text, assistant: fullText });
              } else if (eventType === "done") {
                if (parsed.memory) {
                  memoryRef.current = parsed.memory;
                  const email = session?.user?.email;
                  if (email) localStorage.setItem(`jarvis_memory_v1_${email}`, JSON.stringify(parsed.memory));
                }
                historyRef.current = [
                  ...historyRef.current,
                  { role: "user", content: text },
                  { role: "assistant", content: fullText },
                ].slice(-8) as Turn[];
                tts.speak(fullText);
              }
            } catch {}
            eventType = "";
          }
        }
      }
    } finally {
      setIsStreaming(false);
      isStreamingRef.current = false;
    }
  }, [session, tts]);

  useEffect(() => { sendRef.current = send; }, [send]);

  function toggleMic() {
    if (micOn) {
      stt.disable();
      setMicOn(false);
      setLiveBubble(null);
    } else {
      stt.enable();
      setMicOn(true);
    }
  }

  function handleClose() {
    setExpanded(false);
    stt.disable();
    setMicOn(false);
    setLiveBubble(null);
    tts.stop();
  }

  if (hidden) return null;

  const statusColor = tts.speaking
    ? "bg-accent-violet animate-pulse"
    : isStreaming
    ? "bg-accent-violet animate-pulse"
    : micOn && liveBubble
    ? "bg-accent-blue animate-pulse"
    : micOn
    ? "bg-success animate-pulse"
    : "bg-text-muted";

  const statusLabel = tts.speaking
    ? "Speaking…"
    : isStreaming
    ? "Processing…"
    : liveBubble?.text
    ? "Listening…"
    : micOn
    ? "Ready — speak"
    : "JARVIS Widget";

  return (
    <div className="fixed bottom-6 right-5 z-50 flex flex-col items-end gap-2 pointer-events-none">
      {/* Expanded card */}
      {expanded && (
        <div className="w-80 rounded-card bg-background-surface border border-border-default shadow-elevated animate-slide-up pointer-events-auto">
          {/* Header */}
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border-default">
            <span className={cn("w-1.5 h-1.5 rounded-full flex-none", statusColor)} />
            <span className="text-[11px] font-mono text-text-muted flex-1 truncate">{statusLabel}</span>

            {/* Mute toggle — prominent */}
            <button
              onClick={tts.toggle}
              title={tts.enabled ? "Mute JARVIS voice" : "Unmute JARVIS voice"}
              className={cn(
                "flex items-center gap-1 px-2 py-1 rounded-input text-[10px] font-mono border transition-colors",
                tts.enabled
                  ? "border-accent-violet/30 bg-accent-violet/10 text-accent-violet hover:bg-accent-violet/20"
                  : "border-border-default bg-background-elevated text-text-muted hover:text-text-secondary"
              )}
            >
              {tts.enabled ? <Volume2 size={10} /> : <VolumeX size={10} />}
              {tts.enabled ? "Muted off" : "Muted"}
            </button>

            <button onClick={toggleMic} title={micOn ? "Disable mic" : "Enable mic"}
              className={cn("p-1.5 rounded-input border transition-colors",
                micOn
                  ? "border-accent-blue/30 bg-accent-blue/10 text-accent-blue hover:bg-accent-blue/20"
                  : "border-border-default bg-background-elevated text-text-muted hover:text-text-secondary"
              )}>
              {micOn ? <Mic size={12} /> : <MicOff size={12} />}
            </button>

            <button onClick={() => router.push("/assistant")} title="Open full assistant"
              className="p-1.5 rounded-input text-text-muted hover:text-text-secondary border border-transparent hover:border-border-default transition-colors">
              <ExternalLink size={12} />
            </button>

            <button onClick={handleClose} title="Close widget"
              className="p-1.5 rounded-input text-text-muted hover:text-accent-red border border-transparent hover:border-accent-red/20 transition-colors">
              <X size={12} />
            </button>
          </div>

          {/* Body */}
          <div className="px-4 py-3 space-y-2.5 max-h-72 overflow-y-auto">
            {/* User's spoken query */}
            {lastTurn?.user && (
              <div className="flex justify-end">
                <div className="bg-accent-blue/10 border border-accent-blue/20 rounded-card px-3 py-2 max-w-[85%]">
                  <p className="text-xs text-text-primary">{lastTurn.user}</p>
                </div>
              </div>
            )}

            {/* Live interim transcript */}
            {liveBubble && !isStreaming && (
              <div className="flex justify-end">
                <div className="bg-accent-blue/10 border border-accent-blue/20 rounded-card px-3 py-2 max-w-[85%]">
                  {liveBubble.text ? (
                    <p className="text-xs text-text-primary italic">{liveBubble.text}</p>
                  ) : (
                    <WaveBar level={liveBubble.level} />
                  )}
                </div>
              </div>
            )}

            {/* JARVIS response */}
            {(lastTurn?.assistant || isStreaming) && (
              <div className="bg-background-elevated border border-border-default rounded-card px-3 py-2.5">
                {lastTurn?.assistant ? (
                  <div className="prose-jarvis text-xs leading-relaxed text-text-primary max-h-48 overflow-y-auto">
                    <ReactMarkdown>{lastTurn.assistant}</ReactMarkdown>
                  </div>
                ) : (
                  <div className="flex gap-1 py-0.5">
                    {[0, 1, 2].map((i) => (
                      <span key={i} className="w-1.5 h-1.5 rounded-full bg-text-muted animate-bounce"
                        style={{ animationDelay: `${i * 150}ms` }} />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Empty state */}
            {!liveBubble && !lastTurn && !isStreaming && (
              <div className="text-center py-4">
                <p className="text-xs text-text-muted">
                  {micOn ? "Speak to JARVIS — listening now" : "Enable mic or type in the assistant"}
                </p>
                <button
                  onClick={() => router.push("/assistant")}
                  className="mt-2 text-[10px] text-accent-blue hover:underline font-mono"
                >
                  Open full assistant →
                </button>
              </div>
            )}
          </div>

          {/* Muted banner */}
          {!tts.enabled && (
            <div className="px-4 py-2 border-t border-border-default bg-background-elevated/50">
              <p className="text-[10px] font-mono text-text-muted text-center">
                Voice muted · JARVIS will respond in text only
              </p>
            </div>
          )}
        </div>
      )}

      {/* FAB */}
      <button
        onClick={() => (expanded ? handleClose() : setExpanded(true))}
        title="JARVIS voice"
        className={cn(
          "w-14 h-14 rounded-full flex items-center justify-center shadow-elevated transition-all duration-200 pointer-events-auto",
          expanded
            ? "bg-background-elevated border border-border-hover text-text-secondary hover:text-text-primary"
            : micOn && !isStreaming
            ? "bg-accent-blue text-background-base hover:opacity-90"
            : isStreaming
            ? "bg-accent-violet text-white animate-pulse"
            : "bg-background-elevated border border-border-hover text-text-secondary hover:border-accent-blue/40 hover:text-accent-blue"
        )}
      >
        {expanded ? <ChevronDown size={20} /> : <Mic size={20} />}
      </button>
    </div>
  );
}

function WaveBar({ level }: { level: number }) {
  const mults = [0.5, 0.8, 1.0, 0.9, 0.6, 0.4, 0.7];
  return (
    <div className="flex items-center gap-0.5 h-5">
      {mults.map((m, i) => (
        <span key={i} className="w-1 rounded-full bg-accent-blue transition-all duration-75"
          style={{ height: `${Math.max(3, Math.round(level * m * 0.2))}px` }} />
      ))}
    </div>
  );
}
