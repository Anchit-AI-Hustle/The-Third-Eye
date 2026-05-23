"use client";

import { useState, useRef, useEffect, useCallback, KeyboardEvent } from "react";
import { useSession } from "next-auth/react";
import { Send, Cpu, Zap, RotateCcw, Volume2, VolumeX, Mic, MicOff, Globe, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useVoiceSTT, useTTS } from "@/hooks/useVoice";
import { useLocalTasks } from "@/hooks/useLocalTasks";
import { useLocalKnowledge } from "@/hooks/useLocalKnowledge";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
  toolsUsed?: string[];
  error?: string;
}

interface LiveBubble {
  phase: "recording" | "transcribing" | "interim";
  level: number;
  text?: string;
}

interface HistoryEntry {
  role: "user" | "assistant";
  content: string | object[];
}

const SUGGESTIONS = [
  "What are my urgent tasks?",
  "Add a task: review Q2 by Friday",
  "What's today's date?",
  "Help me plan my week",
  "Search my knowledge base",
  "Draft a follow-up email",
];

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

export function AssistantClient({ userName }: { userName?: string }) {
  const { data: session } = useSession();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [lang, setLang] = useState("");
  const [showLang, setShowLang] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [liveBubble, setLiveBubble] = useState<LiveBubble | null>(null);
  const [micOn, setMicOn] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const historyRef = useRef<HistoryEntry[]>([]);
  const memoryRef = useRef<Record<string, string>>({});
  const abortRef = useRef<AbortController | null>(null);
  const isStreamingRef = useRef(false);
  const sendRef = useRef<(text?: string) => Promise<void>>(async () => {});

  // Echo suppression: suppress VAD while TTS is speaking + brief cooldown after
  const suppressRef = useRef(false);
  const cooldownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { allTasks, create: createTask } = useLocalTasks();
  const { docs } = useLocalKnowledge();
  const tts = useTTS();

  const stt = useVoiceSTT({
    lang,
    shouldSuppress: useCallback(() => suppressRef.current, []),
    onLevel: useCallback((l: number) => {
      setLiveBubble((prev) => prev?.phase === "recording" || prev?.phase === "interim"
        ? { ...prev, level: l } : prev);
    }, []),
    onSpeechStart: useCallback(() => {
      setLiveBubble({ phase: "recording", level: 0 });
    }, []),
    onSpeechEnd: useCallback(() => {
      setLiveBubble((prev) => prev ? { ...prev, phase: "transcribing" } : null);
    }, []),
    onInterim: useCallback((text: string) => {
      if (!text) {
        setLiveBubble((prev) => prev ? { ...prev, phase: "transcribing" } : null);
        return;
      }
      setLiveBubble((prev) => ({
        phase: "interim",
        level: prev?.level ?? 0,
        text,
      }));
    }, []),
    onTranscript: useCallback((text: string) => {
      setLiveBubble(null);
      if (!isStreamingRef.current) sendRef.current(text);
    }, []),
  });

  // Track TTS state in a ref so callbacks can see it
  useEffect(() => {
    if (tts.speaking) {
      if (cooldownTimerRef.current) clearTimeout(cooldownTimerRef.current);
      suppressRef.current = true;
    } else {
      // brief cooldown after TTS ends to let mic settle
      cooldownTimerRef.current = setTimeout(() => {
        suppressRef.current = false;
      }, 800);
    }
  }, [tts.speaking]);

  // Auto-start mic on mount
  useEffect(() => {
    if (stt.supported) {
      stt.enable();
      setMicOn(true);
    }
    return () => stt.disable();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stt.supported]);

  useEffect(() => { isStreamingRef.current = isStreaming; }, [isStreaming]);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, liveBubble]);

  const sendMessage = useCallback(async (text?: string) => {
    const msg = (text ?? input).trim();
    if (!msg || isStreamingRef.current) return;

    setInput("");
    setApiError(null);
    setLiveBubble(null);
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    const userMsg: Message = { id: crypto.randomUUID(), role: "user", content: msg };
    const assistantId = crypto.randomUUID();
    setMessages((prev) => [...prev, userMsg, {
      id: assistantId, role: "assistant", content: "", streaming: true, toolsUsed: [],
    }]);
    setIsStreaming(true);

    abortRef.current = new AbortController();

    try {
      const readyDocs = docs.filter((d) => d.processing_status === "ready")
        .map((d) => ({ id: d.id, title: d.title, content: d.content, chunk_count: d.chunk_count }));

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: msg,
          history: historyRef.current,
          memory: memoryRef.current,
          userName: userName ?? session?.user?.name?.split(" ")[0],
          tasks: allTasks,
          docs: readyDocs,
        }),
        signal: abortRef.current.signal,
      });

      if (!res.ok) {
        let errMsg = `HTTP ${res.status}`;
        try { const j = await res.json(); errMsg = j.error ?? errMsg; } catch {}
        throw new Error(errMsg);
      }
      if (!res.body) throw new Error("No response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let fullText = "";
      const toolsUsed: string[] = [];
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
              if (eventType === "text" && parsed.text !== undefined) {
                fullText += parsed.text;
                setMessages((prev) => prev.map((m) =>
                  m.id === assistantId ? { ...m, content: fullText, toolsUsed } : m
                ));
              } else if (eventType === "tool" && parsed.name) {
                toolsUsed.push(parsed.name);
                setMessages((prev) => prev.map((m) =>
                  m.id === assistantId ? { ...m, toolsUsed: [...toolsUsed] } : m
                ));
              } else if (eventType === "error") {
                const errMsg = parsed.message ?? "Unknown error";
                setMessages((prev) => prev.map((m) =>
                  m.id === assistantId ? { ...m, content: "", error: errMsg, streaming: false } : m
                ));
                setApiError(errMsg);
                return;
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
                      createTask({ title: fx.data.title, priority: fx.data.priority ?? "medium", status: "todo", assignee: fx.data.assignee, due_date: fx.data.due_date, description: fx.data.description });
                    }
                    if (fx.type === "note_create" && fx.data?.title) {
                      const notes = JSON.parse(localStorage.getItem("jarvis_notes_v1") ?? "[]");
                      notes.unshift({ id: crypto.randomUUID(), title: fx.data.title, content: fx.data.content, pinned: false, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
                      localStorage.setItem("jarvis_notes_v1", JSON.stringify(notes));
                    }
                  }
                }
                // Suppress VAD while TTS speaks (useEffect on tts.speaking handles this)
                tts.speak(fullText);
              }
            } catch { /* non-JSON */ }
            eventType = "";
          }
        }
      }

      setMessages((prev) => prev.map((m) =>
        m.id === assistantId ? { ...m, streaming: false } : m
      ));
    } catch (err: any) {
      if (err?.name === "AbortError") return;
      const errMsg = err?.message ?? "Unknown error";
      setApiError(errMsg);
      setMessages((prev) => prev.map((m) =>
        m.id === assistantId ? { ...m, content: "", error: errMsg, streaming: false } : m
      ));
    } finally {
      setIsStreaming(false);
    }
  }, [input, session, userName, allTasks, docs, createTask, tts]);

  useEffect(() => { sendRef.current = sendMessage; }, [sendMessage]);

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  }

  function handleClear() {
    if (isStreaming) abortRef.current?.abort();
    tts.stop();
    setMessages([]);
    setLiveBubble(null);
    setApiError(null);
    historyRef.current = [];
    memoryRef.current = {};
    setIsStreaming(false);
  }

  function toggleMic() {
    if (micOn) { stt.disable(); setMicOn(false); setLiveBubble(null); }
    else { stt.enable(); setMicOn(true); }
  }

  const isEmpty = messages.length === 0 && !liveBubble;

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* Top bar */}
      <div className="flex-none flex items-center justify-between px-4 sm:px-8 py-2 border-b border-border-default bg-background-surface">
        <div className="flex items-center gap-2">
          <span className={cn("w-1.5 h-1.5 rounded-full",
            tts.speaking ? "bg-accent-violet animate-pulse"
            : suppressRef.current ? "bg-warning animate-pulse"
            : liveBubble?.phase === "recording" || liveBubble?.phase === "interim" ? "bg-accent-blue animate-pulse"
            : micOn && !isStreaming ? "bg-success animate-pulse"
            : isStreaming ? "bg-accent-violet animate-pulse"
            : "bg-text-muted"
          )} />
          <span className="text-xs font-mono text-text-muted">
            {tts.speaking ? "JARVIS speaking…"
              : isStreaming ? "JARVIS responding…"
              : liveBubble?.phase === "transcribing" ? "Recognising…"
              : liveBubble?.phase === "interim" ? "Listening…"
              : liveBubble?.phase === "recording" ? "Listening…"
              : micOn ? "Ready — just speak"
              : "Mic off"}
          </span>
          {apiError?.includes("ANTHROPIC_API_KEY") && (
            <span className="text-[10px] font-mono text-accent-red ml-2">· Add ANTHROPIC_API_KEY in Vercel</span>
          )}
        </div>
        <div className="flex items-center gap-1 relative">
          <button onClick={() => setShowLang((v) => !v)}
            className={cn("p-1.5 rounded-input transition-colors", showLang ? "text-accent-blue" : "text-text-muted hover:text-text-secondary")}>
            <Globe size={12} />
          </button>
          {showLang && (
            <div className="absolute top-8 right-8 bg-background-elevated border border-border-default rounded-card shadow-xl z-50 min-w-[180px] py-1 max-h-60 overflow-y-auto">
              {LANGUAGES.map((l) => (
                <button key={l.code} onClick={() => { setLang(l.code); setShowLang(false); }}
                  className={cn("w-full text-left px-3 py-1.5 text-xs transition-colors",
                    lang === l.code ? "text-accent-blue bg-accent-blue/10" : "text-text-secondary hover:text-text-primary hover:bg-background-surface")}>
                  {l.label}
                </button>
              ))}
            </div>
          )}
          <button onClick={tts.toggle} title={tts.enabled ? "Mute JARVIS" : "Unmute JARVIS"}
            className={cn("p-1.5 rounded-input transition-colors",
              tts.enabled ? tts.speaking ? "text-accent-violet animate-pulse" : "text-accent-violet" : "text-text-muted hover:text-text-secondary")}>
            {tts.enabled ? <Volume2 size={13} /> : <VolumeX size={13} />}
          </button>
          {stt.supported && (
            <button onClick={toggleMic} title={micOn ? "Mute mic" : "Unmute mic"}
              className={cn("p-1.5 rounded-input transition-colors",
                micOn ? "text-accent-blue" : "text-text-muted hover:text-text-secondary")}>
              {micOn ? <Mic size={13} /> : <MicOff size={13} />}
            </button>
          )}
          {messages.length > 0 && (
            <button onClick={handleClear} title="Clear conversation"
              className="p-1.5 rounded-input text-text-muted hover:text-text-secondary transition-colors">
              <RotateCcw size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Error banner */}
      {apiError && !apiError.includes("ANTHROPIC_API_KEY") && (
        <div className="flex-none flex items-center gap-2 px-4 sm:px-8 py-2 bg-accent-red/10 border-b border-accent-red/20">
          <AlertCircle size={12} className="text-accent-red flex-none" />
          <span className="text-xs text-accent-red">{apiError}</span>
        </div>
      )}

      {/* Conversation */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-6 space-y-5">
        {isEmpty && <EmptyState userName={userName} supported={stt.supported} onSuggest={sendMessage} />}

        {messages.map((msg) => <MessageBubble key={msg.id} message={msg} session={session} />)}

        {/* Live voice bubble — waveform or interim text */}
        {liveBubble && (
          <div className="flex items-start gap-3 animate-slide-in flex-row-reverse">
            <UserAvatar session={session} />
            <div className="max-w-[85%] sm:max-w-[75%] items-end flex flex-col">
              <div className="rounded-card px-4 py-3 bg-accent-blue/10 border border-accent-blue/20">
                {liveBubble.phase === "interim" && liveBubble.text ? (
                  <span className="text-sm text-text-primary italic">{liveBubble.text}</span>
                ) : liveBubble.phase === "recording" ? (
                  <VoiceWaveform level={liveBubble.level} />
                ) : (
                  <div className="flex items-center gap-2 text-text-muted text-sm">
                    <span className="w-1.5 h-1.5 rounded-full bg-accent-blue animate-pulse" />
                    Recognising…
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Listening indicator between turns */}
        {micOn && !isStreaming && !tts.speaking && !liveBubble && messages.length > 0 && (
          <div className="flex items-center gap-2 justify-center py-2">
            <span className="w-1 h-1 rounded-full bg-success animate-pulse" />
            <span className="text-[11px] font-mono text-text-muted">listening</span>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Text input */}
      <div className="flex-none px-4 sm:px-8 py-4 border-t border-border-default bg-background-base">
        <div className="flex items-end gap-3 bg-background-surface border border-border-default rounded-card px-4 py-3 focus-within:border-border-hover transition-colors">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={micOn ? "Or type here…" : "Message JARVIS…"}
            rows={1}
            disabled={isStreaming}
            className="flex-1 bg-transparent text-text-primary placeholder:text-text-muted text-sm resize-none outline-none max-h-32 leading-relaxed disabled:opacity-60"
            style={{ height: "auto" }}
            onInput={(e) => {
              const t = e.currentTarget;
              t.style.height = "auto";
              t.style.height = `${Math.min(t.scrollHeight, 128)}px`;
            }}
          />
          <button onClick={() => sendMessage()} disabled={!input.trim() || isStreaming}
            className={cn("flex-none p-1.5 rounded-input transition-colors",
              input.trim() && !isStreaming ? "text-accent-blue hover:bg-accent-blue/10" : "text-text-muted cursor-not-allowed")}>
            <Send size={15} />
          </button>
        </div>
        <p className="text-text-muted text-[11px] mt-2 text-center">
          {micOn ? "Speak naturally · pause to send · or type + Enter" : "Enter to send · Shift+Enter for new line"}
        </p>
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function VoiceWaveform({ level }: { level: number }) {
  const bars = [0.5, 0.8, 1.0, 0.9, 0.6, 0.4, 0.7];
  return (
    <div className="flex items-center gap-1 h-6">
      {bars.map((mult, i) => {
        const h = Math.max(4, Math.round(level * mult * 0.22));
        return (
          <span key={i} className="w-1 rounded-full bg-accent-blue transition-all duration-75"
            style={{ height: `${h}px` }} />
        );
      })}
    </div>
  );
}

function EmptyState({ userName, supported, onSuggest }: { userName?: string; supported: boolean; onSuggest: (t: string) => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[50vh] gap-8 animate-fade-in">
      <div className="text-center">
        <div className="w-14 h-14 rounded-full bg-accent-blue/10 border border-accent-blue/20 flex items-center justify-center mx-auto mb-4">
          <Cpu size={22} className="text-accent-blue" />
        </div>
        <p className="text-text-primary font-semibold text-base mb-1">
          {userName ? `Good to see you, ${userName}.` : "JARVIS is online."}
        </p>
        <p className="text-text-secondary text-sm">
          {supported ? "Just speak — or tap a suggestion below." : "Type below to begin."}
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-lg">
        {SUGGESTIONS.map((s) => (
          <button key={s} onClick={() => onSuggest(s)}
            className="text-left px-4 py-3 rounded-card bg-background-surface border border-border-default hover:border-accent-blue/30 hover:bg-accent-blue/5 transition-all text-sm text-text-secondary hover:text-text-primary">
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

function MessageBubble({ message, session }: { message: Message; session: any }) {
  const isUser = message.role === "user";
  return (
    <div className={cn("flex items-start gap-3 animate-slide-in", isUser && "flex-row-reverse")}>
      {isUser ? <UserAvatar session={session} /> : <AgentAvatar />}
      <div className={cn("max-w-[85%] sm:max-w-[75%]", isUser && "items-end flex flex-col")}>
        {message.toolsUsed && message.toolsUsed.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {message.toolsUsed.map((tool, i) => (
              <span key={i} className="inline-flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded-badge bg-accent-violet/10 border border-accent-violet/20 text-accent-violet">
                <Zap size={9} /> {tool}
              </span>
            ))}
          </div>
        )}
        <div className={cn("rounded-card px-4 py-3 text-sm leading-relaxed",
          isUser ? "bg-accent-blue/10 border border-accent-blue/20 text-text-primary"
          : message.error ? "bg-accent-red/5 border border-accent-red/20"
          : "bg-background-surface border border-border-default text-text-primary")}>
          {isUser ? (
            <span className="whitespace-pre-wrap">{message.content}</span>
          ) : message.error ? (
            <div className="flex items-start gap-2">
              <AlertCircle size={13} className="text-accent-red flex-none mt-0.5" />
              <div>
                <p className="text-accent-red text-sm font-medium">Error</p>
                <p className="text-accent-red/80 text-xs mt-0.5">{message.error}</p>
                {message.error.includes("ANTHROPIC_API_KEY") && (
                  <p className="text-text-muted text-xs mt-2">
                    Add <code className="font-mono bg-background-elevated px-1 rounded">ANTHROPIC_API_KEY</code> in Vercel → Settings → Environment Variables → Redeploy.
                  </p>
                )}
              </div>
            </div>
          ) : (
            <>
              {message.content ? (
                <div className="prose-jarvis">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
                </div>
              ) : message.streaming ? <ThinkingDots /> : null}
              {message.streaming && message.content && (
                <span className="inline-block w-0.5 h-3.5 bg-accent-blue ml-0.5 animate-pulse align-middle" />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function AgentAvatar() {
  return (
    <div className="w-7 h-7 rounded-full bg-accent-blue/20 border border-accent-blue/30 flex-none flex items-center justify-center">
      <Cpu size={13} className="text-accent-blue" />
    </div>
  );
}

function UserAvatar({ session }: { session: any }) {
  if (session?.user?.image)
    return <img src={session.user.image} alt="" className="w-7 h-7 rounded-full flex-none object-cover" />;
  return (
    <div className="w-7 h-7 rounded-full bg-accent-violet/20 border border-accent-violet/30 flex-none flex items-center justify-center text-xs text-accent-violet font-medium">
      {session?.user?.name?.[0]?.toUpperCase() ?? "?"}
    </div>
  );
}

function ThinkingDots() {
  return (
    <div className="flex gap-1 py-0.5">
      {[0, 1, 2].map((i) => (
        <span key={i} className="w-1.5 h-1.5 rounded-full bg-text-muted animate-bounce"
          style={{ animationDelay: `${i * 150}ms` }} />
      ))}
    </div>
  );
}
