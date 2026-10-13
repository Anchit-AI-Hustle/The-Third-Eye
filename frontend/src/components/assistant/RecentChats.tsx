"use client";

import { History, MessageSquare } from "lucide-react";
import type { ChatSummary } from "@/hooks/useChatLibrary";

function ago(iso: string, now: number): string {
  const min = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const h = Math.round(min / 60);
  return h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
}

export function RecentChats({ chats, now = Date.now(), onOpen, onShowAll }: {
  chats: ChatSummary[]; now?: number; onOpen: (id: string) => void; onShowAll: () => void;
}) {
  if (!chats.length) return null;
  const [latest, ...rest] = chats;
  return (
    <div className="w-full max-w-lg space-y-2">
      <button type="button" onClick={() => onOpen(latest.id)} aria-label={`Continue: ${latest.title || "Untitled chat"}`}
        className="w-full flex items-center gap-3 text-left px-4 py-3 rounded-card bg-accent-blue/10 border border-accent-blue/30 hover:bg-accent-blue/15 transition-colors">
        <History size={16} className="flex-none text-accent-blue" />
        <span className="flex-1 min-w-0">
          <span className="block text-[11px] font-mono uppercase tracking-wider text-accent-blue">Continue</span>
          <span className="block text-sm text-text-primary truncate">{latest.title || "Untitled chat"}</span>
        </span>
        <span className="text-[11px] text-text-muted flex-none">{ago(latest.updated_at, now)}</span>
      </button>
      {rest.slice(0, 3).map((c) => (
        <button key={c.id} type="button" onClick={() => onOpen(c.id)}
          className="w-full flex items-center gap-3 text-left px-4 py-2 rounded-card border border-border-default hover:bg-background-surface transition-colors">
          <MessageSquare size={13} className="flex-none text-text-muted" />
          <span className="flex-1 min-w-0 text-sm text-text-secondary truncate">{c.title || "Untitled chat"}</span>
          <span className="text-[11px] text-text-muted flex-none">{ago(c.updated_at, now)}</span>
        </button>
      ))}
      {chats.length > 4 && (
        <button type="button" onClick={onShowAll} className="w-full text-center text-xs text-text-muted hover:text-text-secondary py-1">
          All chats ({chats.length})
        </button>
      )}
    </div>
  );
}
