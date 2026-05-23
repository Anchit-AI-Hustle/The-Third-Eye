"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { Mic, MicOff, Volume2, VolumeX, X, Send, Globe } from "lucide-react";
import { cn } from "@/lib/utils";
import { useVoiceSTT, useTTS } from "@/hooks/useVoice";
import { useLocalTasks } from "@/hooks/useLocalTasks";
import { useLocalKnowledge } from "@/hooks/useLocalKnowledge";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface LiveBubble {
  phase: "recording" | "transcribing" | "interim";
  level: number;
  text?: string;
}

const LANGUAGES = [
  { code: "", label: "Auto" },
  { code: "en-US", label: "English (US)" },
  { code: "en-GB", label: "English (UK)" },
  { code: "hi-IN", label: "हिन्दी" },
  { code: "es-ES", label: "Español" },
  { code: "fr-FR", label: "Français" },
  { code: "de-DE", label: "Deutsch" },
  { code: "pt-BR", label: "Português" },
  { code: "ja-JP", label: "日本語" },
  { code: "zh-CN", label: "中文" },
  { code: "ar-SA", label: "العربية" },
  { code: "ko-KR", label: "한국어" },
];

export function VoiceOverlay() {
  const pathname = usePathname();
  const { data: session } = useSession();

  const [open, setOpen] = useState(false);
  const [lang, setLang] = useState("");
  const [showLang, setShowLang] = useState(false);
  const [liveBubble, setLiveBubble] = useState<LiveBubble | null>(null);
  const [response, setResponse] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [input, setInput] = useState("");

  const isStreamingRef = useRef(false);
  const suppressRef = useRef(false);
  const cooldownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const historyRef = useRef<{ role: string; content: string }[]>([]);
  const memoryRef = useRef<Record<string, string>>({});
  const sendRef = useRef<(text?: string) => Promise<void>>(async () => {});
  const panelRef = useRef<HTMLDivElement>(null);

  const { allTasks, create: createTask } = useLocalTasks();
  const { docs } = useLocalKnowledge();
  const tts = useTTS();

  const stt = useVoiceSTT({
    lang,
    shouldSuppress: useCallback(() => suppressRef.current, []),
    onLevel: useCallback((l: number) => {
      setLiveBubble((prev) =>
        prev?.phase === "recording" || prev?.phase === "interim"
          ? { ...prev, level: l }
          : prev
      );
    }, []),
    onSpeechStart: useCallback(() => {
      setLiveBubble({ phase: "recording", level: 0 });
    }, []),
    onSpeechEnd: useCallback(() => {
      setLiveBubble((prev) => (prev ? { ...prev, phase: "transcribing" } : null));
    }, []),
    onInterim: useCallback((text: string) => {
      if (!text) {
        setLiveBubble((prev) => (prev ? { ...prev, phase: "transcribing" } : null));
        return;
      }
      setLiveBubble((prev) => ({ phase: "interim", level: prev?.level ?? 0, text }));
    }, []),
    onTranscript: useCallback((text: string) => {
      setLiveBubble(null);
      if (!isStreamingRef.current) sendRef.current(text);
    }, []),
  });

  // Echo suppression
  useEffect(() => {
    if (tts.speaking) {
      if (cooldownTimerRef.current) clearTimeout(cooldownTimerRef.current);
      suppressRef.current = true;
    } else {
      cooldownTimerRef.current = setTimeout(() => {
        suppressRef.current = false;
      }, 800);
    }
  }, [tts.speaking]);

  useEffect(() => {
    isStreamingRef.current = isStreaming;
  }, [isStreaming]);

  // Start/stop mic when overlay opens/closes
  useEffect(() => {
    if (open && stt.supported) {
      stt.enable();
    } else {
      stt.disable();
      tts.stop();
      setLiveBubble(null);
    }
    return () => stt.disable();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, stt.supported]);

  const sendMessage = useCallback(
    async (text?: string) => {
      const msg = (text ?? input).trim();
      if (!msg || isStreamingRef.current) return;

      setInput("");
      setResponse("");
      setLiveBubble(null);
      setIsStreaming(true);
      abortRef.current = new AbortController();

      try {
        const readyDocs = docs
          .filter((d) => d.processing_status === "ready")
          .map((d) => ({ id: d.id, title: d.title, content: d.content, chunk_count: d.chunk_count }));

        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: msg,
            history: historyRef.current,
            memory: memoryRef.current,
            userName: session?.user?.name?.split(" ")[0],
            tasks: allTasks,
            docs: readyDocs,
          }),
          signal: abortRef.current.signal,
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        if (!res.body) throw new Error("No response body");

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
            if (line.startsWith("event: ")) {
              eventType = line.slice(7).trim();
              continue;
            }
            if (line.startsWith("data: ")) {
              try {
                const parsed = JSON.parse(line.slice(6));
                if (eventType === "text" && parsed.text !== undefined) {
                  fullText += parsed.text;
                  setResponse(fullText);
                } else if (eventType === "done") {
                  if (parsed.memory) memoryRef.current = parsed.memory;
                  historyRef.current = [
                    ...historyRef.current,
                    { role: "user", content: msg },
                    { role: "assistant", content: fullText },
                  ];
                  if (parsed.sideEffects) {
                    for (const fx of parsed.sideEffects) {
                      if (fx.type === "task_create" && fx.data?.title) {
                        createTask({
                          title: fx.data.title,
                          priority: fx.data.priority ?? "medium",
                          status: "todo",
                          assignee: fx.data.assignee,
                          due_date: fx.data.due_date,
                          description: fx.data.description,
                        });
                      }
                      if (fx.type === "note_create" && fx.data?.title) {
                        const notes = JSON.parse(localStorage.getItem("jarvis_notes_v1") ?? "[]");
                        notes.unshift({
                          id: crypto.randomUUID(),
                          title: fx.data.title,
                          content: fx.data.content,
                          pinned: false,
                          created_at: new Date().toISOString(),
                          updated_at: new Date().toISOString(),
                        });
                        localStorage.setItem("jarvis_notes_v1", JSON.stringify(notes));
                      }
                    }
                  }
                  tts.speak(fullText);
                }
              } catch {}
              eventType = "";
            }
          }
        }
      } catch (err: any) {
        if (err?.name === "AbortError") return;
        setResponse(`Error: ${err?.message ?? "Unknown error"}`);
      } finally {
        setIsStreaming(false);
      }
    },
    [input, session, allTasks, docs, createTask, tts]
  );

  useEffect(() => {
    sendRef.current = sendMessage;
  }, [sendMessage]);

  // Hide on assistant page (it has its own voice UI)
  if (pathname === "/assistant") return null;

  // Hide if browser doesn't support speech
  if (!stt.supported) return null;

  return (
    <>
      {/* Floating mic button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-20 right-4 lg:bottom-6 lg:right-6 z-50 w-12 h-12 rounded-full bg-accent-blue text-white shadow-lg hover:bg-accent-blue/90 transition-all flex items-center justify-center hover:scale-105 active:scale-95"
          title="Talk to JARVIS"
        >
          <Mic size={20} />
        </button>
      )}

      {/* Voice panel */}
      {open && (
        <div
          ref={panelRef}
          className="fixed bottom-20 right-4 lg:bottom-6 lg:right-6 z-50 w-80 sm:w-96 bg-background-elevated border border-border-default rounded-card shadow-2xl animate-slide-in flex flex-col max-h-[70vh]"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border-default">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "w-1.5 h-1.5 rounded-full",
                  tts.speaking
                    ? "bg-accent-violet animate-pulse"
                    : liveBubble?.phase === "recording" || liveBubble?.phase === "interim"
                    ? "bg-accent-blue animate-pulse"
                    : isStreaming
                    ? "bg-accent-violet animate-pulse"
                    : "bg-success animate-pulse"
                )}
              />
              <span className="text-xs font-mono text-text-muted">
                {tts.speaking
                  ? "JARVIS speaking…"
                  : isStreaming
                  ? "Responding…"
                  : liveBubble?.phase === "interim"
                  ? "Listening…"
                  : liveBubble?.phase === "recording"
                  ? "Listening…"
                  : liveBubble?.phase === "transcribing"
                  ? "Recognising…"
                  : "Ready — speak"}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setShowLang((v) => !v)}
                className={cn(
                  "p-1.5 rounded-input transition-colors",
                  showLang ? "text-accent-blue" : "text-text-muted hover:text-text-secondary"
                )}
              >
                <Globe size={12} />
              </button>
              <button
                onClick={tts.toggle}
                className={cn(
                  "p-1.5 rounded-input transition-colors",
                  tts.enabled ? "text-accent-violet" : "text-text-muted hover:text-text-secondary"
                )}
              >
                {tts.enabled ? <Volume2 size={12} /> : <VolumeX size={12} />}
              </button>
              <button
                onClick={() => setOpen(false)}
                className="p-1.5 rounded-input text-text-muted hover:text-text-secondary transition-colors"
              >
                <X size={12} />
              </button>
            </div>
          </div>

          {/* Language picker */}
          {showLang && (
            <div className="border-b border-border-default px-3 py-2 flex flex-wrap gap-1">
              {LANGUAGES.map((l) => (
                <button
                  key={l.code}
                  onClick={() => {
                    setLang(l.code);
                    setShowLang(false);
                  }}
                  className={cn(
                    "px-2 py-1 text-[10px] rounded-badge transition-colors",
                    lang === l.code
                      ? "bg-accent-blue/20 text-accent-blue"
                      : "text-text-muted hover:text-text-secondary hover:bg-background-surface"
                  )}
                >
                  {l.label}
                </button>
              ))}
            </div>
          )}

          {/* Content area */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-[120px]">
            {/* Live voice bubble */}
            {liveBubble && (
              <div className="flex items-center gap-2">
                <div className="rounded-card px-3 py-2 bg-accent-blue/10 border border-accent-blue/20">
                  {liveBubble.phase === "interim" && liveBubble.text ? (
                    <span className="text-sm text-text-primary italic">{liveBubble.text}</span>
                  ) : liveBubble.phase === "recording" ? (
                    <Waveform level={liveBubble.level} />
                  ) : (
                    <div className="flex items-center gap-2 text-text-muted text-xs">
                      <span className="w-1.5 h-1.5 rounded-full bg-accent-blue animate-pulse" />
                      Recognising…
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Response */}
            {response && (
              <div className="rounded-card px-3 py-2 bg-background-surface border border-border-default text-sm text-text-primary">
                <div className="prose-jarvis text-sm">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{response}</ReactMarkdown>
                </div>
                {isStreaming && (
                  <span className="inline-block w-0.5 h-3.5 bg-accent-blue ml-0.5 animate-pulse align-middle" />
                )}
              </div>
            )}

            {/* Empty state */}
            {!liveBubble && !response && !isStreaming && (
              <div className="flex flex-col items-center justify-center py-6 text-center">
                <div className="w-10 h-10 rounded-full bg-accent-blue/10 border border-accent-blue/20 flex items-center justify-center mb-3">
                  <Mic size={18} className="text-accent-blue" />
                </div>
                <p className="text-text-muted text-xs">Speak or type below</p>
              </div>
            )}
          </div>

          {/* Text input */}
          <div className="flex-none px-3 py-2 border-t border-border-default">
            <div className="flex items-center gap-2 bg-background-surface border border-border-default rounded-card px-3 py-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
                placeholder="Or type here…"
                disabled={isStreaming}
                className="flex-1 bg-transparent text-text-primary placeholder:text-text-muted text-sm outline-none disabled:opacity-60"
              />
              <button
                onClick={() => sendMessage()}
                disabled={!input.trim() || isStreaming}
                className={cn(
                  "p-1 rounded-input transition-colors",
                  input.trim() && !isStreaming
                    ? "text-accent-blue hover:bg-accent-blue/10"
                    : "text-text-muted cursor-not-allowed"
                )}
              >
                <Send size={13} />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Waveform({ level }: { level: number }) {
  const bars = [0.5, 0.8, 1.0, 0.9, 0.6, 0.4, 0.7];
  return (
    <div className="flex items-center gap-1 h-5">
      {bars.map((mult, i) => {
        const h = Math.max(4, Math.round(level * mult * 0.22));
        return (
          <span
            key={i}
            className="w-1 rounded-full bg-accent-blue transition-all duration-75"
            style={{ height: `${h}px` }}
          />
        );
      })}
    </div>
  );
}
