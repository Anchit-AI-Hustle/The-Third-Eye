"use client";

import { useState, useRef, useEffect, KeyboardEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { sendMessage } from "@/lib/api";
import { ChatMessage } from "@/types";
import { Send, Cpu } from "lucide-react";
import { cn } from "@/lib/utils";

export function AssistantClient() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
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
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-8 py-6 space-y-6">
        {messages.length === 0 && (
          <div className="text-center pt-16">
            <Cpu size={32} className="mx-auto text-text-muted mb-4 opacity-50" />
            <p className="text-text-secondary text-sm">
              How can I assist you today?
            </p>
            <p className="text-text-muted text-xs mt-1">
              Ask anything — I have memory of your tasks and preferences.
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

      {/* Input */}
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

function MessageBubble({ message }: { message: ChatMessage }) {
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
        {message.model_used && (
          <p className="text-text-muted text-xs mt-1 font-mono">
            {message.model_used} · {message.latency_ms}ms
          </p>
        )}
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
