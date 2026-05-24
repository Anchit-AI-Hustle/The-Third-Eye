"use client";

import { useState, useRef, useEffect, useCallback, KeyboardEvent } from "react";
import { useSession } from "next-auth/react";
import { Send, Cpu, Zap, RotateCcw, Volume2, VolumeX, Mic, MicOff, Globe, AlertCircle, Paperclip, X, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useVoiceSTT, useTTS } from "@/hooks/useVoice";
import { useLocalTasks } from "@/hooks/useLocalTasks";
import { useLocalKnowledge } from "@/hooks/useLocalKnowledge";
import { useAgentProfile } from "@/hooks/useAgentProfile";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
  toolsUsed?: string[];
  error?: string;
  attachments?: string[];
}

interface LiveBubble {
  phase: "recording" | "transcribing" | "interim";
  level: number;
  text?: string;
}

interface AttachedFile {
  name: string;
  content: string;
  size: number;
}

const SUGGESTIONS = [
  "What are my urgent tasks?",
  "Search the web for latest AI news",
  "Add a task: review Q2 by Friday",
  "Draft an email to the team about project status",
  "Help me plan my week",
  "Summarize my uploaded documents",
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

async function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => resolve(`[Could not read file: ${file.name}]`);
    reader.readAsText(file);
  });
}

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
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const historyRef = useRef<{ role: string; content: string }[]>([]);
  const memoryRef = useRef<Record<string, string>>({});
  const abortRef = useRef<AbortController | null>(null);
  const isStreamingRef = useRef(false);
  const sendRef = useRef<(text?: string) => Promise<void>>(async () => {});

  const suppressRef = useRef(false);
  const cooldownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { allTasks, create: createTask } = useLocalTasks();
  const { docs } = useLocalKnowledge();
  const { active: agent } = useAgentProfile();
  const tts = useTTS(agent.voicePreference);

  const stt = useVoiceSTT({
    lang,
    shouldSuppress: useCallback(() => suppressRef.current, []),
    onLevel: useCallback((l: number) => {
      setLiveBubble((prev) => prev?.phase === "recording" || prev?.phase === "interim"
        ? { ...prev, level: l } : prev);
    }, []),
    onSpeechStart: useCallback(() => { setLiveBubble({ phase: "recording", level: 0 }); }, []),
    onSpeechEnd: useCallback(() => {
      setLiveBubble((prev) => prev ? { ...prev, phase: "transcribing" } : null);
    }, []),
    onInterim: useCallback((text: string) => {
      if (!text) { setLiveBubble((prev) => prev ? { ...prev, phase: "transcribing" } : null); return; }
      setLiveBubble((prev) => ({ phase: "interim", level: prev?.level ?? 0, text }));
    }, []),
    onTranscript: useCallback((text: string) => {
      setLiveBubble(null);
      if (!isStreamingRef.current) sendRef.current(text);
    }, []),
  });

  useEffect(() => {
    if (tts.speaking) {
      if (cooldownTimerRef.current) clearTimeout(cooldownTimerRef.current);
      suppressRef.current = true;
    } else {
      cooldownTimerRef.current = setTimeout(() => { suppressRef.current = false; }, 800);
    }
  }, [tts.speaking]);

  useEffect(() => {
    if (stt.supported) { stt.enable(); setMicOn(true); }
    return () => stt.disable();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stt.supported]);

  useEffect(() => { isStreamingRef.current = isStreaming; }, [isStreaming]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, liveBubble]);

  async function handleFiles(files: FileList | File[]) {
    const newFiles: AttachedFile[] = [];
    for (const file of Array.from(files)) {
      if (file.size > 5 * 1024 * 1024) continue; // 5MB limit
      const content = await readFileAsText(file);
      newFiles.push({ name: file.name, content: content.slice(0, 50000), size: file.size });
    }
    setAttachedFiles((prev) => [...prev, ...newFiles]);
  }

  const sendMessage = useCallback(async (text?: string) => {
    const msg = (text ?? input).trim();
    if (!msg || isStreamingRef.current) return;

    const currentAttachments = [...attachedFiles];
    setInput("");
    setAttachedFiles([]);
    setApiError(null);
    setLiveBubble(null);
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    const userMsg: Message = {
      id: crypto.randomUUID(), role: "user", content: msg,
      attachments: currentAttachments.map((f) => f.name),
    };
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
          userEmail: session?.user?.email,
          agentName: agent.name,
          agentPersonality: agent.personality,
          tasks: allTasks,
          docs: readyDocs,
          attachments: currentAttachments.map((f) => ({ name: f.name, content: f.content })),
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
                tts.speak(fullText);
              }
            } catch {}
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
  }, [input, session, userName, allTasks, docs, createTask, tts, attachedFiles, agent]);

  useEffect(() => { sendRef.current = sendMessage; }, [sendMessage]);

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  }

  function handleClear() {
    if (isStreaming) abortRef.current?.abort();
    tts.stop();
    setMessages([]); setLiveBubble(null); setApiError(null); setAttachedFiles([]);
    historyRef.current = []; memoryRef.current = {};
    setIsStreaming(false);
  }

  function toggleMic() {
    if (micOn) { stt.disable(); setMicOn(false); setLiveBubble(null); }
    else { stt.enable(); setMicOn(true); }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault(); setIsDragging(false);
    if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
  }

  const isEmpty = messages.length === 0 && !liveBubble;

  const status = tts.speaking ? "SPEAKING"
    : isStreaming ? "PROCESSING"
    : liveBubble?.phase === "transcribing" ? "RECOGNISING"
    : liveBubble?.phase === "interim" || liveBubble?.phase === "recording" ? "LISTENING"
    : micOn ? "READY" : "STANDBY";

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden"
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}>

      {/* Drag overlay */}
      {isDragging && (
        <div className="absolute inset-0 z-50 bg-background-base/80 backdrop-blur-sm flex items-center justify-center border-2 border-dashed border-[#4FC3F7]/40 rounded-card">
          <div className="text-center">
            <Paperclip size={32} className="text-[#4FC3F7] mx-auto mb-2" />
            <p className="text-[#4FC3F7] font-mono text-sm">Drop files to attach</p>
          </div>
        </div>
      )}

      {/* Top bar */}
      <div className="flex-none flex items-center justify-between px-4 sm:px-8 py-2 border-b border-[rgba(79,195,247,0.08)] bg-background-surface">
        <div className="flex items-center gap-2">
          <div className="arc-reactor flex-none" style={{ width: 20, height: 20 }}>
            <div className="arc-reactor-core" style={{ width: 5, height: 5 }} />
          </div>
          <span className="hud-label text-[#4FC3F7] text-[9px]">{status}</span>
          {apiError?.includes("GEMINI_API_KEY") && (
            <span className="text-[10px] font-mono text-accent-red ml-2">· Add GEMINI_API_KEY</span>
          )}
        </div>
        <div className="flex items-center gap-1 relative">
          <button onClick={() => setShowLang((v) => !v)}
            className={cn("p-1.5 rounded-input transition-colors", showLang ? "text-[#4FC3F7]" : "text-text-muted hover:text-text-secondary")}>
            <Globe size={12} />
          </button>
          {showLang && (
            <div className="absolute top-8 right-8 bg-background-elevated border border-border-default rounded-card shadow-xl z-50 min-w-[180px] py-1 max-h-60 overflow-y-auto">
              {LANGUAGES.map((l) => (
                <button key={l.code} onClick={() => { setLang(l.code); setShowLang(false); }}
                  className={cn("w-full text-left px-3 py-1.5 text-xs transition-colors",
                    lang === l.code ? "text-[#4FC3F7] bg-[#4FC3F7]/10" : "text-text-secondary hover:text-text-primary hover:bg-background-surface")}>
                  {l.label}
                </button>
              ))}
            </div>
          )}
          <button onClick={tts.toggle} title={tts.enabled ? "Mute" : "Unmute"}
            className={cn("p-1.5 rounded-input transition-colors",
              tts.enabled ? "text-accent-violet" : "text-text-muted hover:text-text-secondary")}>
            {tts.enabled ? <Volume2 size={13} /> : <VolumeX size={13} />}
          </button>
          {stt.supported && (
            <button onClick={toggleMic} title={micOn ? "Mic off" : "Mic on"}
              className={cn("p-1.5 rounded-input transition-colors",
                micOn ? "text-[#4FC3F7]" : "text-text-muted hover:text-text-secondary")}>
              {micOn ? <Mic size={13} /> : <MicOff size={13} />}
            </button>
          )}
          {messages.length > 0 && (
            <button onClick={handleClear} title="Clear"
              className="p-1.5 rounded-input text-text-muted hover:text-text-secondary transition-colors">
              <RotateCcw size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Error banner */}
      {apiError && !apiError.includes("GEMINI_API_KEY") && (
        <div className="flex-none flex items-center gap-2 px-4 sm:px-8 py-2 bg-accent-red/10 border-b border-accent-red/20">
          <AlertCircle size={12} className="text-accent-red flex-none" />
          <span className="text-xs text-accent-red">{apiError}</span>
        </div>
      )}

      {/* Conversation */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-6 space-y-5">
        {isEmpty && <EmptyState userName={userName} agentName={agent.name} greeting={agent.greeting} supported={stt.supported} onSuggest={sendMessage} />}

        {messages.map((msg) => <MessageBubble key={msg.id} message={msg} session={session} />)}

        {liveBubble && (
          <div className="flex items-start gap-3 animate-slide-in flex-row-reverse">
            <UserAvatar session={session} />
            <div className="max-w-[85%] sm:max-w-[75%] items-end flex flex-col">
              <div className="rounded-card px-4 py-3 bg-[#4FC3F7]/8 border border-[#4FC3F7]/15">
                {liveBubble.phase === "interim" && liveBubble.text ? (
                  <span className="text-sm text-text-primary italic">{liveBubble.text}</span>
                ) : liveBubble.phase === "recording" ? (
                  <VoiceWaveform level={liveBubble.level} />
                ) : (
                  <div className="flex items-center gap-2 text-text-muted text-sm">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#4FC3F7] animate-pulse" />
                    Recognising…
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {micOn && !isStreaming && !tts.speaking && !liveBubble && messages.length > 0 && (
          <div className="flex items-center gap-2 justify-center py-2">
            <span className="w-1 h-1 rounded-full bg-success animate-pulse" />
            <span className="hud-label text-[9px]">listening</span>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Attached files preview */}
      {attachedFiles.length > 0 && (
        <div className="flex-none px-4 sm:px-8 py-2 border-t border-[rgba(79,195,247,0.08)] bg-background-surface/50">
          <div className="flex flex-wrap gap-2">
            {attachedFiles.map((f, i) => (
              <div key={i} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-badge bg-[#4FC3F7]/8 border border-[#4FC3F7]/15 text-xs">
                <FileText size={10} className="text-[#4FC3F7]" />
                <span className="text-text-secondary font-mono max-w-[120px] truncate">{f.name}</span>
                <span className="text-text-muted text-[10px]">({(f.size / 1024).toFixed(0)}KB)</span>
                <button onClick={() => setAttachedFiles((prev) => prev.filter((_, j) => j !== i))}
                  className="text-text-muted hover:text-accent-red ml-1"><X size={10} /></button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="flex-none px-4 sm:px-8 py-4 border-t border-[rgba(79,195,247,0.08)] bg-background-base">
        <div className="flex items-end gap-2 bg-background-surface border border-border-default rounded-card px-3 py-2.5 focus-within:border-[#4FC3F7]/30 transition-colors">
          <input type="file" ref={fileInputRef} className="hidden" multiple
            accept=".txt,.md,.csv,.json,.js,.ts,.py,.html,.css,.xml,.yaml,.yml,.log,.sql,.sh,.env,.cfg,.ini,.toml,.pdf,.docx"
            onChange={(e) => { if (e.target.files) handleFiles(e.target.files); e.target.value = ""; }} />
          <button onClick={() => fileInputRef.current?.click()} title="Attach files"
            className="flex-none p-1 text-text-muted hover:text-[#4FC3F7] transition-colors">
            <Paperclip size={15} />
          </button>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={micOn ? "Or type here…" : `Ask ${agent.name} anything…`}
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
          <button onClick={() => sendMessage()} disabled={(!input.trim() && !attachedFiles.length) || isStreaming}
            className={cn("flex-none p-1.5 rounded-input transition-colors",
              (input.trim() || attachedFiles.length) && !isStreaming ? "text-[#4FC3F7] hover:bg-[#4FC3F7]/10" : "text-text-muted cursor-not-allowed")}>
            <Send size={15} />
          </button>
        </div>
        <p className="text-text-muted text-[10px] mt-2 text-center font-mono tracking-wider">
          {micOn ? "SPEAK · PAUSE TO SEND · OR TYPE + ENTER · DROP FILES TO ATTACH" : "ENTER TO SEND · SHIFT+ENTER NEW LINE · DROP FILES TO ATTACH"}
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
      {bars.map((mult, i) => (
        <span key={i} className="w-1 rounded-full bg-[#4FC3F7] transition-all duration-75"
          style={{ height: `${Math.max(4, Math.round(level * mult * 0.22))}px` }} />
      ))}
    </div>
  );
}

function EmptyState({ userName, agentName, greeting, supported, onSuggest }: { userName?: string; agentName: string; greeting: string; supported: boolean; onSuggest: (t: string) => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[50vh] gap-8 animate-fade-in">
      <div className="text-center">
        <div className="arc-reactor arc-reactor-lg mx-auto mb-5">
          <div className="arc-reactor-ring3" />
          <div className="arc-reactor-core" />
        </div>
        <p className="text-text-primary font-semibold text-base mb-1">
          {userName ? `${greeting}, ${userName}.` : `${agentName} is online.`}
        </p>
        <p className="text-text-muted text-sm">
          {supported ? "Speak, type, or drop files — I'll handle the rest." : "Type below or drop files to begin."}
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-lg">
        {SUGGESTIONS.map((s) => (
          <button key={s} onClick={() => onSuggest(s)}
            className="text-left px-4 py-3 rounded-card holo-card hover:border-[#4FC3F7]/30 transition-all text-sm text-text-secondary hover:text-text-primary">
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
        {message.attachments && message.attachments.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-1.5">
            {message.attachments.map((f, i) => (
              <span key={i} className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-badge bg-[#4FC3F7]/8 border border-[#4FC3F7]/15 text-[#4FC3F7]">
                <FileText size={8} /> {f}
              </span>
            ))}
          </div>
        )}
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
          isUser ? "bg-[#4FC3F7]/8 border border-[#4FC3F7]/15 text-text-primary"
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
                {message.error.includes("GEMINI_API_KEY") && (
                  <p className="text-text-muted text-xs mt-2">
                    Add <code className="font-mono bg-background-elevated px-1 rounded">GEMINI_API_KEY</code> in Vercel → Settings → Environment Variables.
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
                <span className="inline-block w-0.5 h-3.5 bg-[#4FC3F7] ml-0.5 animate-pulse align-middle" />
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
    <div className="w-7 h-7 rounded-full bg-[#4FC3F7]/15 border border-[#4FC3F7]/25 flex-none flex items-center justify-center">
      <Cpu size={13} className="text-[#4FC3F7]" />
    </div>
  );
}

function UserAvatar({ session }: { session: any }) {
  if (session?.user?.image)
    return <img src={session.user.image} alt="" className="w-7 h-7 rounded-full flex-none object-cover ring-1 ring-[#4FC3F7]/20" />;
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
