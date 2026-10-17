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

function readable(title: string): string {
  const call = /^CALL (\w+)/.exec(title);
  if (!call) return title || "Untitled chat";
  const words = call[1].replace(/_/g, " ");
  return words[0].toUpperCase() + words.slice(1);
}

export function RecentChats({ chats, now = Date.now(), onOpen, onShowAll }: {
  chats: ChatSummary[]; now?: number; onOpen: (id: string) => void; onShowAll: () => void;
}) {
  if (!chats.length) return null;
  const [latest, ...rest] = chats;
  return (
    <div className="w-full max-w-lg space-y-1">
      <button type="button" onClick={() => onOpen(latest.id)} aria-label={`Continue: ${readable(latest.title)}`}
        className="w-full flex items-center gap-3 text-left px-3.5 py-2.5 rounded-input bg-white/[0.03] border border-white/[0.08] hover:border-accent-blue/30 transition-colors">
        <History size={14} className="flex-none text-accent-blue" />
        <span className="flex-1 min-w-0">
          <span className="block text-[10px] uppercase tracking-[0.14em] text-text-muted">Continue</span>
          <span className="block text-[13px] text-text-primary truncate">{readable(latest.title)}</span>
        </span>
        <span className="text-[11px] text-text-muted flex-none">{ago(latest.updated_at, now)}</span>
      </button>
      {rest.slice(0, 3).map((c) => (
        <button key={c.id} type="button" onClick={() => onOpen(c.id)}
          className="w-full flex items-center gap-3 text-left px-3.5 py-2 rounded-input hover:bg-white/[0.03] transition-colors">
          <MessageSquare size={13} className="flex-none text-text-muted" />
          <span className="flex-1 min-w-0 text-[13px] text-text-secondary truncate">{readable(c.title)}</span>
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
