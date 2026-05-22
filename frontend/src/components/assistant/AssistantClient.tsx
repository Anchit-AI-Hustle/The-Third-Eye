"use client";

import { useState, useRef, useEffect, KeyboardEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { sendMessage } from "@/lib/api";
import { ChatMessage, ChatSource } from "@/types";
import { Send, Cpu, FileText, Globe, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface ExtendedMessage extends ChatMessage {
  agent_name?: string;
  delegated_to?: string | null;
  sources?: ChatSource[];
}

export function AssistantClient() {
  const [messages, setMessages] = useState<ExtendedMessage[]>([]);
  const [input, setInput] = useState("");
  const [sessionId, setSessionId] = useState<string | undefined>();
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const mutation = useMutation({
    mutationFn: ({ message, sid }: { message: string; sid?: string }) =>
      sendMessage(message, sid),
    onSuccess: (data) => {
      setSessionId(data.session_id);
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: data.message,
          timestamp: new Date().toISOString(),
          model_used: data.model_used,
          latency_ms: data.latency_ms,
          agent_name: data.agent_name,
          delegated_to: data.delegated_to,
          sources: data.sources,
        },
      ]);
    },
    onError: () => {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: "I encountered an error processing your request. Please try again.",
          timestamp: new Date().toISOString(),
        },
      ]);
    },
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, mutation.isPending]);

  function handleSend() {
    const text = input.trim();
    if (!text || mutation.isPending) return;

    setInput("");
    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        role: "user",
        content: text,
        timestamp: new Date().toISOString(),
      },
    ]);

    mutation.mutate({ message: text, sid: sessionId });
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex-1 overflow-y-auto px-8 py-6 space-y-6">
        {messages.length === 0 && (
          <div className="text-center pt-16">
            <Cpu size={32} className="mx-auto text-text-muted mb-4 opacity-50" />
            <p className="text-text-secondary text-sm">
              How can I assist you today?
            </p>
            <p className="text-text-muted text-xs mt-1">
              I can search the web, query your documents, and manage tasks.
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}

        {mutation.isPending && (
          <div className="flex items-start gap-3">
            <AgentAvatar />
            <div className="bg-background-surface border border-border-default rounded-card px-4 py-3">
              <ThinkingDots />
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <div className="px-8 py-5 border-t border-border-default">
        <div className="flex items-end gap-3 bg-background-surface border border-border-default rounded-card px-4 py-3 focus-within:border-border-hover transition-colors">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message JARVIS..."
            rows={1}
            className="flex-1 bg-transparent text-text-primary placeholder:text-text-muted text-sm resize-none outline-none max-h-32 leading-relaxed"
            style={{ height: "auto" }}
            onInput={(e) => {
              const t = e.currentTarget;
              t.style.height = "auto";
              t.style.height = `${Math.min(t.scrollHeight, 128)}px`;
            }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || mutation.isPending}
            className={cn(
              "flex-none p-1.5 rounded-input transition-colors",
              input.trim() && !mutation.isPending
                ? "text-accent-blue hover:bg-accent-blue/10"
                : "text-text-muted cursor-not-allowed"
            )}
            title="Send (Enter)"
          >
            <Send size={15} />
          </button>
        </div>
        <p className="text-text-muted text-xs mt-2 text-center">
          Enter to send · Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: ExtendedMessage }) {
  const isUser = message.role === "user";

  return (
    <div className={cn("flex items-start gap-3", isUser && "flex-row-reverse")}>
      {isUser ? <UserAvatar /> : <AgentAvatar />}
      <div className="max-w-[70%]">
        <div
          className={cn(
            "rounded-card px-4 py-3 text-sm leading-relaxed",
            isUser
              ? "bg-accent-blue/10 border border-accent-blue/20 text-text-primary"
              : "bg-background-surface border border-border-default text-text-primary prose-jarvis"
          )}
        >
          <div className="whitespace-pre-wrap">{message.content}</div>
        </div>

        {!isUser && (message.agent_name || message.sources?.length) && (
          <SourcesBlock message={message} />
        )}

        {message.model_used && (
          <p className="text-text-muted text-xs mt-1 font-mono">
            {message.model_used} · {message.latency_ms}ms
          </p>
        )}
      </div>
    </div>
  );
}

function SourcesBlock({ message }: { message: ExtendedMessage }) {
  const sources = message.sources ?? [];
  const hasDocSources = sources.some((s) => s.document_title);
  const hasWebSources = sources.some((s) => s.url);

  return (
    <div className="mt-2 space-y-1">
      {message.agent_name && (
        <div className="text-text-muted text-xs font-mono flex items-center gap-1.5">
          <span>{message.agent_name}</span>
          {message.delegated_to && (
            <>
              <ArrowRight size={10} />
              <span className="text-accent-violet">{message.delegated_to}</span>
            </>
          )}
        </div>
      )}

      {hasDocSources && (
        <div className="flex flex-wrap gap-1.5 mt-1.5">
          {sources
            .filter((s) => s.document_title)
            .map((s, i) => (
              <span
                key={`doc-${i}`}
                className="text-xs font-mono px-2 py-1 rounded-badge bg-background-elevated border border-border-default text-text-secondary flex items-center gap-1.5"
              >
                <FileText size={10} />
                {s.document_title}
                <span className="text-text-muted">· chunk {s.chunk_index}</span>
              </span>
            ))}
        </div>
      )}

      {hasWebSources && (
        <div className="flex flex-wrap gap-1.5 mt-1.5">
          {sources
            .filter((s) => s.url)
            .map((s, i) => (
              <a
                key={`web-${i}`}
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-mono px-2 py-1 rounded-badge bg-background-elevated border border-border-default text-text-secondary hover:text-accent-blue hover:border-accent-blue/30 transition-colors flex items-center gap-1.5 max-w-[300px]"
                title={s.url}
              >
                <Globe size={10} />
                <span className="truncate">{s.title ?? s.url}</span>
              </a>
            ))}
        </div>
      )}
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

function UserAvatar() {
  return (
    <div className="w-7 h-7 rounded-full bg-accent-violet/20 border border-accent-violet/30 flex-none flex items-center justify-center text-xs text-accent-violet font-medium">
      U
    </div>
  );
}

function ThinkingDots() {
  return (
    <div className="flex gap-1 py-0.5">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-text-muted animate-bounce"
          style={{ animationDelay: `${i * 150}ms` }}
        />
      ))}
    </div>
  );
}
