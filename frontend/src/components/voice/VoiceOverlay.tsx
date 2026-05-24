"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { Mic, MicOff, Volume2, VolumeX, X, Send, ChevronDown, Cpu, Paperclip, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { useVoiceSTT, useTTS } from "@/hooks/useVoice";
import { useLocalTasks } from "@/hooks/useLocalTasks";
import { useLocalKnowledge } from "@/hooks/useLocalKnowledge";
import { useAgentProfile } from "@/hooks/useAgentProfile";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface LiveBubble {
  phase: "recording" | "transcribing" | "interim";
  level: number;
  text?: string;
}

export function VoiceOverlay() {
  const pathname = usePathname();
  const { data: session } = useSession();

  const [expanded, setExpanded] = useState(false);
  const [micOn, setMicOn] = useState(false);
  const [liveBubble, setLiveBubble] = useState<LiveBubble | null>(null);
  const [lastQuery, setLastQuery] = useState("");
  const [response, setResponse] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [input, setInput] = useState("");
  const [attachedFiles, setAttachedFiles] = useState<Array<{ name: string; content: string; size: number }>>([]);

  const isStreamingRef = useRef(false);
  const suppressRef = useRef(false);
  const cooldownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const historyRef = useRef<{ role: string; content: string }[]>([]);
  const memoryRef = useRef<Record<string, string>>({});
  const sendRef = useRef<(text?: string) => Promise<void>>(async () => {});
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { allTasks, create: createTask } = useLocalTasks();
  const { docs } = useLocalKnowledge();
  const { active: agent } = useAgentProfile();
  const tts = useTTS(agent.voicePreference);

  const stt = useVoiceSTT({
    lang: "",
    shouldSuppress: useCallback(() => suppressRef.current, []),
    onLevel: useCallback((l: number) => {
      setLiveBubble((prev) =>
        prev?.phase === "recording" || prev?.phase === "interim" ? { ...prev, level: l } : prev
      );
    }, []),
    onSpeechStart: useCallback(() => {
      setLiveBubble({ phase: "recording", level: 0 });
      setExpanded(true);
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

  useEffect(() => {
    if (tts.speaking) {
      if (cooldownTimerRef.current) clearTimeout(cooldownTimerRef.current);
      suppressRef.current = true;
    } else {
      cooldownTimerRef.current = setTimeout(() => { suppressRef.current = false; }, 800);
    }
  }, [tts.speaking]);

  useEffect(() => { isStreamingRef.current = isStreaming; }, [isStreaming]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [response, liveBubble]);

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

  async function handleFiles(files: FileList | File[]) {
    const newFiles: Array<{ name: string; content: string; size: number }> = [];
    for (const file of Array.from(files)) {
      if (file.size > 5 * 1024 * 1024) continue;
      const content = await new Promise<string>((resolve) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result as string);
        r.onerror = () => resolve(`[Could not read: ${file.name}]`);
        r.readAsText(file);
      });
      newFiles.push({ name: file.name, content: content.slice(0, 50000), size: file.size });
    }
    setAttachedFiles((prev) => [...prev, ...newFiles]);
  }

  const sendMessage = useCallback(
    async (text?: string) => {
      const msg = (text ?? input).trim();
      if (!msg || isStreamingRef.current) return;

      const currentAttachments = [...attachedFiles];
      setInput("");
      setAttachedFiles([]);
      setLastQuery(msg);
      setResponse("");
      setLiveBubble(null);
      setExpanded(true);
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
            userEmail: session?.user?.email,
            agentName: agent.name,
            agentPersonality: agent.personality,
            tasks: allTasks,
            docs: readyDocs,
            attachments: currentAttachments.map((f) => ({ name: f.name, content: f.content })),
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
            if (line.startsWith("event: ")) { eventType = line.slice(7).trim(); continue; }
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
    [input, session, allTasks, docs, createTask, tts, attachedFiles, agent]
  );

  useEffect(() => { sendRef.current = sendMessage; }, [sendMessage]);

  if (pathname === "/assistant") return null;
  if (!stt.supported) return null;

  const status = tts.speaking
    ? "SPEAKING"
    : isStreaming
    ? "PROCESSING"
    : liveBubble?.phase === "interim" || liveBubble?.phase === "recording"
    ? "LISTENING"
    : liveBubble?.phase === "transcribing"
    ? "RECOGNISING"
    : micOn
    ? "READY"
    : "STANDBY";

  const statusColor = tts.speaking || isStreaming
    ? "bg-accent-violet"
    : liveBubble
    ? "bg-[#4FC3F7]"
    : micOn
    ? "bg-success"
    : "bg-text-muted";

  return (
    <div className={cn(
      "fixed z-50 transition-all duration-300",
      "bottom-20 right-3 lg:bottom-5 lg:right-5",
      expanded ? "w-[340px] sm:w-[380px]" : "w-auto"
    )}>
      {/* ── Collapsed bubble ── */}
      {!expanded && (
        <button
          onClick={() => setExpanded(true)}
          className="flex items-center gap-2.5 pl-3 pr-2 py-2 rounded-full holo-card shadow-lg hover:shadow-[0_0_20px_rgba(79,195,247,0.15)] transition-all hover:scale-[1.02] active:scale-95 group animate-border-glow"
        >
          <span className={cn("w-2 h-2 rounded-full animate-pulse", statusColor, micOn && "shadow-[0_0_8px_rgba(79,195,247,0.5)]")} />
          {/* Show truncated last response or status */}
          {response && !isStreaming ? (
            <span className="text-xs font-mono text-text-secondary max-w-[160px] truncate">{response.slice(0, 50)}</span>
          ) : (
            <span className="text-xs font-mono text-text-secondary group-hover:text-[#4FC3F7] transition-colors tracking-wider">
              {micOn ? status : agent.name}
            </span>
          )}
          <div className="arc-reactor flex-none" style={{ width: 28, height: 28 }}>
            <div className="arc-reactor-core" style={{ width: 7, height: 7 }} />
          </div>
        </button>
      )}

      {/* ── Expanded panel ── */}
      {expanded && (
        <div className="holo-card rounded-card shadow-2xl animate-slide-in flex flex-col card-glow-arc hud-frame overflow-hidden"
          style={{ maxHeight: "min(65vh, 480px)" }}>

          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-[rgba(79,195,247,0.1)] flex-none">
            <div className="flex items-center gap-2">
              <div className="arc-reactor flex-none" style={{ width: 22, height: 22 }}>
                <div className="arc-reactor-core" style={{ width: 5, height: 5 }} />
              </div>
              <div>
                <span className="hud-label text-[#4FC3F7] text-[9px]">{status}</span>
              </div>
            </div>
            <div className="flex items-center gap-0.5">
              <button onClick={tts.toggle} title={tts.enabled ? "Mute" : "Unmute"}
                className={cn("p-1.5 rounded-input transition-colors",
                  tts.enabled ? "text-accent-violet" : "text-text-muted hover:text-text-secondary")}>
                {tts.enabled ? <Volume2 size={11} /> : <VolumeX size={11} />}
              </button>
              <button onClick={toggleMic} title={micOn ? "Mic off" : "Mic on"}
                className={cn("p-1.5 rounded-input transition-colors",
                  micOn ? "text-[#4FC3F7]" : "text-text-muted hover:text-text-secondary")}>
                {micOn ? <Mic size={11} /> : <MicOff size={11} />}
              </button>
              <button onClick={() => { setExpanded(false); }}
                className="p-1.5 rounded-input text-text-muted hover:text-text-secondary transition-colors">
                <ChevronDown size={11} />
              </button>
            </div>
          </div>

          {/* Content */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-2.5 space-y-2.5 min-h-[80px]">

            {/* Last query */}
            {lastQuery && (
              <div className="flex justify-end">
                <div className="max-w-[85%] rounded-card px-3 py-2 bg-[#4FC3F7]/8 border border-[#4FC3F7]/15 text-sm text-text-primary">
                  {lastQuery}
                </div>
              </div>
            )}

            {/* Live voice bubble */}
            {liveBubble && (
              <div className="flex justify-end">
                <div className="rounded-card px-3 py-2 bg-[#4FC3F7]/8 border border-[#4FC3F7]/15">
                  {liveBubble.phase === "interim" && liveBubble.text ? (
                    <span className="text-sm text-text-primary italic">{liveBubble.text}</span>
                  ) : liveBubble.phase === "recording" ? (
                    <Waveform level={liveBubble.level} />
                  ) : (
                    <div className="flex items-center gap-2 text-text-muted text-xs">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#4FC3F7] animate-pulse" />
                      Recognising…
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* AI response */}
            {response && (
              <div className="flex items-start gap-2">
                <div className="w-5 h-5 rounded-full bg-[#4FC3F7]/10 border border-[#4FC3F7]/20 flex items-center justify-center flex-none mt-0.5">
                  <Cpu size={9} className="text-[#4FC3F7]" />
                </div>
                <div className="flex-1 min-w-0 rounded-card px-3 py-2 bg-background-surface border border-border-default text-text-primary">
                  <div className="prose-jarvis text-[13px] leading-relaxed">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{response}</ReactMarkdown>
                  </div>
                  {isStreaming && (
                    <span className="inline-block w-0.5 h-3 bg-[#4FC3F7] ml-0.5 animate-pulse align-middle" />
                  )}
                </div>
              </div>
            )}

            {/* Empty state */}
            {!liveBubble && !response && !lastQuery && (
              <div className="flex flex-col items-center justify-center py-5 text-center">
                <div className="arc-reactor mb-3" style={{ width: 36, height: 36 }}>
                  <div className="arc-reactor-core" style={{ width: 10, height: 10 }} />
                </div>
                <p className="hud-label text-[#4FC3F7]/60 text-[9px]">
                  {micOn ? "Listening — speak or type" : "Tap mic to start"}
                </p>
              </div>
            )}

            {/* Listening indicator */}
            {micOn && !isStreaming && !tts.speaking && !liveBubble && response && (
              <div className="flex items-center gap-1.5 justify-center py-1">
                <span className="w-1 h-1 rounded-full bg-success animate-pulse" />
                <span className="hud-label text-[9px]">listening</span>
              </div>
            )}
          </div>

          {/* Attached files */}
          {attachedFiles.length > 0 && (
            <div className="flex-none px-2.5 py-1.5 border-t border-[rgba(79,195,247,0.06)]">
              <div className="flex flex-wrap gap-1">
                {attachedFiles.map((f, i) => (
                  <span key={i} className="inline-flex items-center gap-1 px-2 py-1 rounded-badge bg-[#4FC3F7]/8 border border-[#4FC3F7]/15 text-[10px] font-mono text-text-secondary">
                    <FileText size={8} className="text-[#4FC3F7]" />
                    <span className="max-w-[80px] truncate">{f.name}</span>
                    <button onClick={() => setAttachedFiles((prev) => prev.filter((_, j) => j !== i))}
                      className="text-text-muted hover:text-accent-red"><X size={8} /></button>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Input bar */}
          <div className="flex-none px-2.5 py-2 border-t border-[rgba(79,195,247,0.08)]">
            <input type="file" ref={fileInputRef} className="hidden" multiple
              accept=".txt,.md,.csv,.json,.js,.ts,.py,.html,.css,.xml,.yaml,.yml,.log,.sql,.sh"
              onChange={(e) => { if (e.target.files) handleFiles(e.target.files); e.target.value = ""; }} />
            <div className="flex items-center gap-1.5 bg-background-surface/50 border border-border-default rounded-card px-2.5 py-1.5">
              <button onClick={() => fileInputRef.current?.click()} title="Attach file"
                className="flex-none p-0.5 text-text-muted hover:text-[#4FC3F7] transition-colors">
                <Paperclip size={11} />
              </button>
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                placeholder={micOn ? "Or type…" : `Ask ${agent.name}…`}
                disabled={isStreaming}
                className="flex-1 bg-transparent text-text-primary placeholder:text-text-muted text-xs outline-none disabled:opacity-60 font-mono"
              />
              <button onClick={() => sendMessage()} disabled={(!input.trim() && !attachedFiles.length) || isStreaming}
                className={cn("p-0.5 rounded-input transition-colors",
                  (input.trim() || attachedFiles.length) && !isStreaming ? "text-[#4FC3F7] hover:bg-[#4FC3F7]/10" : "text-text-muted cursor-not-allowed")}>
                <Send size={11} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Waveform({ level }: { level: number }) {
  const bars = [0.5, 0.8, 1.0, 0.9, 0.6, 0.4, 0.7];
  return (
    <div className="flex items-center gap-0.5 h-4">
      {bars.map((mult, i) => (
        <span key={i} className="w-[3px] rounded-full bg-[#4FC3F7] transition-all duration-75"
          style={{ height: `${Math.max(3, Math.round(level * mult * 0.18))}px` }} />
      ))}
    </div>
  );
}
