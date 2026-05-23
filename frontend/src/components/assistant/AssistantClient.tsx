"use client";

import { useState, useRef, useEffect, useCallback, KeyboardEvent } from "react";
import { useSession } from "next-auth/react";
import { Send, Cpu, Zap, RotateCcw, Mic, MicOff, Volume2, VolumeX } from "lucide-react";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useSpeechToText, useTTS } from "@/hooks/useVoice";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
  toolsUsed?: string[];
}

interface HistoryEntry {
  role: "user" | "assistant";
  content: string | object[];
}

const SUGGESTIONS = [
  "What can you help me with?",
  "What's today's date and time?",
  "Help me plan my week",
  "Write a concise executive summary template",
  "Explain quantum computing simply",
  "Draft a professional email for a follow-up",
];

export function AssistantClient({ userName }: { userName?: string }) {
  const { data: session } = useSession();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const historyRef = useRef<HistoryEntry[]>([]);
  const memoryRef = useRef<Record<string, string>>({});
  const abortRef = useRef<AbortController | null>(null);

  const tts = useTTS();
  const stt = useSpeechToText((transcript) => {
    setInput(transcript);
    // auto-focus textarea after transcript lands
    textareaRef.current?.focus();
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = useCallback(async (text?: string) => {
    const msg = (text ?? input).trim();
    if (!msg || isStreaming) return;

    setInput("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }

    const userMsg: Message = { id: crypto.randomUUID(), role: "user", content: msg };
    setMessages((prev) => [...prev, userMsg]);

    const assistantId = crypto.randomUUID();
    setMessages((prev) => [...prev, {
      id: assistantId, role: "assistant", content: "", streaming: true, toolsUsed: [],
    }]);
    setIsStreaming(true);

    abortRef.current = new AbortController();

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: msg,
          history: historyRef.current,
          memory: memoryRef.current,
          userName: userName ?? session?.user?.name?.split(" ")[0],
        }),
        signal: abortRef.current.signal,
      });

      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

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
          if (line.startsWith("event: ")) {
            eventType = line.slice(7).trim();
            continue;
          }
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
              } else if (eventType === "done") {
                if (parsed.memory) memoryRef.current = parsed.memory;
                historyRef.current = [
                  ...historyRef.current,
                  { role: "user", content: msg },
                  { role: "assistant", content: fullText },
                ];
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
      setMessages((prev) => prev.map((m) =>
        m.id === assistantId
          ? { ...m, content: "I encountered an error. Please try again.", streaming: false }
          : m
      ));
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  }, [input, isStreaming, session, userName]);

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  }

  function handleClear() {
    if (isStreaming) { abortRef.current?.abort(); }
    setMessages([]);
    historyRef.current = [];
    memoryRef.current = {};
    setIsStreaming(false);
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-6 space-y-5">
        {messages.length === 0 ? (
          <EmptyState userName={userName} onSuggest={handleSend} />
        ) : (
          messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} session={session} />
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="flex-none px-4 sm:px-8 py-4 border-t border-border-default bg-background-base">
        <div className="flex items-end gap-3 bg-background-surface border border-border-default rounded-card px-4 py-3 focus-within:border-border-hover transition-colors duration-150">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message JARVIS…"
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
          {/* Mic button */}
          {stt.supported && (
            <button
              onClick={stt.listening ? stt.stop : stt.start}
              title={stt.listening ? "Stop listening" : "Voice input"}
              className={cn(
                "flex-none p-1.5 rounded-input transition-colors",
                stt.listening
                  ? "text-accent-red bg-accent-red/10 animate-pulse"
                  : "text-text-muted hover:text-accent-blue"
              )}
            >
              {stt.listening ? <MicOff size={15} /> : <Mic size={15} />}
            </button>
          )}

          {/* TTS toggle */}
          {tts.supported && (
            <button
              onClick={tts.toggle}
              title={tts.enabled ? "Mute JARVIS voice" : "Enable JARVIS voice"}
              className={cn(
                "flex-none p-1.5 rounded-input transition-colors",
                tts.enabled
                  ? "text-accent-violet hover:text-accent-violet/70"
                  : "text-text-muted hover:text-text-secondary"
              )}
            >
              {tts.enabled ? <Volume2 size={15} /> : <VolumeX size={15} />}
            </button>
          )}

          {messages.length > 0 && (
            <button
              onClick={handleClear}
              title="Clear conversation"
              className="flex-none p-1.5 rounded-input text-text-muted hover:text-text-secondary transition-colors"
            >
              <RotateCcw size={13} />
            </button>
          )}
          <button
            onClick={() => handleSend()}
            disabled={!input.trim() || isStreaming}
            className={cn(
              "flex-none p-1.5 rounded-input transition-colors",
              input.trim() && !isStreaming
                ? "text-accent-blue hover:bg-accent-blue/10"
                : "text-text-muted cursor-not-allowed"
            )}
            title="Send (Enter)"
          >
            <Send size={15} />
          </button>
        </div>
        <p className="text-text-muted text-[11px] mt-2 text-center">
          Enter to send · Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}

function EmptyState({ userName, onSuggest }: { userName?: string; onSuggest: (text: string) => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[50vh] gap-8 animate-fade-in">
      <div className="text-center">
        <div className="w-14 h-14 rounded-full bg-accent-blue/10 border border-accent-blue/20 flex items-center justify-center mx-auto mb-4">
          <Cpu size={22} className="text-accent-blue" />
        </div>
        <p className="text-text-primary font-semibold text-base mb-1">
          {userName ? `Good to see you, ${userName}.` : "JARVIS is online."}
        </p>
        <p className="text-text-secondary text-sm">How can I assist you today?</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-lg">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            onClick={() => onSuggest(s)}
            className="text-left px-4 py-3 rounded-card bg-background-surface border border-border-default hover:border-accent-blue/30 hover:bg-accent-blue/5 transition-all text-sm text-text-secondary hover:text-text-primary"
          >
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
                <Zap size={9} />
                {tool}
              </span>
            ))}
          </div>
        )}

        <div className={cn(
          "rounded-card px-4 py-3 text-sm leading-relaxed",
          isUser
            ? "bg-accent-blue/10 border border-accent-blue/20 text-text-primary"
            : "bg-background-surface border border-border-default text-text-primary"
        )}>
          {isUser ? (
            <span className="whitespace-pre-wrap">{message.content}</span>
          ) : (
            <>
              {message.content ? (
                <div className="prose-jarvis">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
                </div>
              ) : message.streaming ? (
                <ThinkingDots />
              ) : null}
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
  if (session?.user?.image) {
    return <img src={session.user.image} alt="" className="w-7 h-7 rounded-full flex-none object-cover" />;
  }
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
        <span key={i} className="w-1.5 h-1.5 rounded-full bg-text-muted animate-bounce" style={{ animationDelay: `${i * 150}ms` }} />
      ))}
    </div>
  );
}
