"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { Mic, MicOff, Volume2, VolumeX, X, Send, ChevronDown, Cpu, Paperclip, FileText, Radio } from "lucide-react";
import { cn } from "@/lib/utils";
import { useVoiceSTT, useTTS } from "@/hooks/useVoice";
import { useWakeWord } from "@/hooks/useWakeWord";
import { useCapability } from "@/components/permission/PermissionProvider";
import { getPolicy, PERM_POLICY_EVENT } from "@/lib/consent";
import { useLocalTasks } from "@/hooks/useLocalTasks";
import { useLocalKnowledge } from "@/hooks/useLocalKnowledge";
import { useAgentActions } from "@/hooks/useAgentActions";
import { useAgentConfirm, classifyVoiceConfirm, type PendingAction } from "@/hooks/useAgentConfirm";
import { useAgentProfile } from "@/hooks/useAgentProfile";
import { useMode } from "@/hooks/useMode";
import { ActionCard } from "@/components/assistant/ActionCard";
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
  const [wakeEnabled, setWakeEnabled] = useState(() => {
    if (typeof window === "undefined") return true;
    const v = localStorage.getItem("jarvis_wake_enabled");
    return v === null ? true : v === "true";
  });
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
  // Mirror of the pending sensitive actions so voice callbacks can read the
  // latest without being re-created on every state change.
  const pendingRef = useRef<PendingAction[]>([]);

  const { allTasks } = useLocalTasks();
  const applyActions = useAgentActions();
  const { docs } = useLocalKnowledge();
  const { active: agent } = useAgentProfile();
  const { modeId } = useMode();
  const requestCapability = useCapability();
  const tts = useTTS(agent.voicePreference);
  const {
    pendingActions,
    pendingOpens,
    addPending,
    dismissOpen,
    openLinks,
    confirmAction,
    cancelAction,
  } = useAgentConfirm();

  useEffect(() => { pendingRef.current = pendingActions; }, [pendingActions]);

  // Hands-free confirmation: if the agent is waiting on a sensitive action and
  // the user says "confirm" / "cancel", act on the most recent pending one.
  // Returns true if the transcript was consumed as a confirm/cancel.
  const handleVoiceConfirm = useCallback((text: string): boolean => {
    const waiting = pendingRef.current.filter((a) => a.status === "pending");
    if (!waiting.length) return false;
    const verdict = classifyVoiceConfirm(text);
    if (!verdict) return false;
    const target = waiting[waiting.length - 1];
    if (verdict === "confirm") {
      // Deep-link intents need a real tap gesture on iOS; voice can't provide
      // one, so those still require the on-card tap. Server actions (send_email)
      // execute fully hands-free here.
      confirmAction(target);
    } else {
      cancelAction(target.id);
    }
    return true;
  }, [confirmAction, cancelAction]);

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
      // A pending "confirm before I act" takes priority over a new question.
      if (handleVoiceConfirm(text)) return;
      if (!isStreamingRef.current) sendRef.current(text);
    }, [handleVoiceConfirm]),
  });

  // App-wide wake word: passively listen for the agent's name while the mic is
  // off (so it never fights the main recognizer). Saying "JARVIS" opens the
  // panel and starts listening — true hands-free entry.
  const onWake = useCallback(async () => {
    if (isStreamingRef.current) return;
    if (!(await requestCapability("microphone"))) return;
    setExpanded(true);
    stt.enable();
    setMicOn(true);
  }, [stt, requestCapability]);
  // Passive wake-word listening is continuous microphone access, so it only runs
  // when the user granted the mic for every time. Otherwise the user drives it
  // via the mic button, which asks through the gate.
  const [micAlways, setMicAlways] = useState(false);
  useEffect(() => {
    const read = () => setMicAlways(getPolicy("microphone") === "always");
    read();
    window.addEventListener(PERM_POLICY_EVENT, read);
    return () => window.removeEventListener(PERM_POLICY_EVENT, read);
  }, []);
  // !tts.speaking matters even though micOn is normally true after a wake:
  // a typed question with the mic off still gets a spoken reply, and the wake
  // recognizer would otherwise hear the agent say its own name and self-trigger.
  useWakeWord({
    agentName: agent.name,
    enabled: wakeEnabled && micAlways && !micOn && !tts.speaking,
    onWake,
    cooldownMs: 2000,
  });

  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem("jarvis_wake_enabled", String(wakeEnabled));
  }, [wakeEnabled]);

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

  async function toggleMic() {
    if (micOn) {
      stt.disable();
      setMicOn(false);
      setLiveBubble(null);
    } else {
      if (!(await requestCapability("microphone"))) return;
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
            agentId: agent.id,
            agentPersona: agent.personality,
            mode: modeId,
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
                } else if (eventType === "confirm" && parsed.tool) {
                  // Sensitive action needs explicit approval. Show the card and,
                  // hands-free, prompt the user to say "confirm" or "cancel".
                  addPending({
                    id: parsed.id, tool: parsed.tool, args: parsed.args,
                    summary: parsed.summary, status: "pending",
                    url: parsed.url, openLabel: parsed.openLabel, clientAction: parsed.clientAction,
                  });
                  if (micOn) tts.speak(`${parsed.summary}. Say confirm to proceed, or cancel.`);
                } else if (eventType === "error") {
                  setResponse(`Error: ${parsed.message ?? "Unknown error"}`);
                } else if (eventType === "done") {
                  if (parsed.memory) memoryRef.current = parsed.memory;
                  historyRef.current = [
                    ...historyRef.current,
                    { role: "user", content: msg },
                    { role: "assistant", content: fullText },
                  ];
                  applyActions(parsed.sideEffects);
                  openLinks(parsed.sideEffects);
                  if (fullText) tts.speak(fullText);
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
    [input, session, allTasks, docs, applyActions, tts, attachedFiles, agent, modeId, addPending, openLinks, micOn]
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

  // Only animate the indicator while something is actually happening. A
  // perpetual pulse on an always-visible corner widget reads as "blinking".
  const indicatorActive = tts.speaking || isStreaming || !!liveBubble;

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
          className={cn(
            "flex items-center gap-2.5 pl-3 pr-2 py-2 rounded-full holo-card shadow-lg hover:shadow-[0_0_20px_rgba(79,195,247,0.15)] transition-all hover:scale-[1.02] active:scale-95 group",
            indicatorActive && "animate-border-glow",
          )}
        >
          <span className={cn("w-2 h-2 rounded-full transition-colors", statusColor, indicatorActive && "animate-pulse", micOn && "shadow-[0_0_8px_rgba(79,195,247,0.5)]")} />
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
              <button onClick={() => setWakeEnabled((w) => !w)}
                title={wakeEnabled ? `Wake word on — say "${agent.name}"` : "Wake word off"}
                className={cn("p-1.5 rounded-input transition-colors",
                  wakeEnabled ? "text-success" : "text-text-muted hover:text-text-secondary")}>
                <Radio size={11} />
              </button>
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

            {/* Pending sensitive actions — confirm before acting */}
            {pendingActions.map((a) => (
              <ActionCard key={a.id} action={a} onConfirm={() => confirmAction(a)} onCancel={() => cancelAction(a.id)} />
            ))}

            {/* Links the browser blocked — one tap opens them (a real gesture) */}
            {pendingOpens.map((o) => (
              <div key={o.url} className="flex items-center gap-2">
                <a href={o.url} target="_blank" rel="noopener noreferrer"
                  onClick={() => dismissOpen(o.url)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-input bg-[#4FC3F7]/10 text-[#4FC3F7] border border-[#4FC3F7]/25 text-xs font-medium hover:bg-[#4FC3F7]/20 transition-colors max-w-full truncate">
                  Open {o.label}
                </a>
              </div>
            ))}

            {/* Empty state */}
            {!liveBubble && !response && !lastQuery && pendingActions.length === 0 && (
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
