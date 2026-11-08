"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Smartphone, X } from "lucide-react";
import { isPhone } from "@/lib/handoff";
import { deviceSendable, sendFromDevice } from "@/lib/nativeOutreach";

// On a phone: checks in with /api/handoff (so the laptop knows a phone is
// there) and shows what was asked for on another device, ready in one tap.
// WhatsApp lets no app press send, so the person's tap opens the chat typed.

interface Item { id: string; action: string; url: string; native_url: string | null; label: string; detail: string }
const POLL_MS = 15_000;

const close = (id: string, status: "opened" | "dismissed") =>
  fetch("/api/handoff", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status }) }).catch(() => {});

export function HandoffBridge() {
  const { status } = useSession();
  const [items, setItems] = useState<Item[]>([]);

  const poll = useCallback(async () => {
    if (document.visibilityState !== "visible") return;
    try {
      const d = await (await fetch("/api/handoff")).json();
      if (Array.isArray(d.items)) setItems(d.items);
    } catch { /* offline: next poll */ }
  }, []);

  useEffect(() => {
    if (status !== "authenticated" || !isPhone()) return;
    void poll();
    const t = setInterval(poll, POLL_MS);
    document.addEventListener("visibilitychange", poll);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", poll); };
  }, [status, poll]);

  const open = useCallback(async (it: Item) => {
    setItems((xs) => xs.filter((x) => x.id !== it.id));
    void close(it.id, "opened");
    const body = it.url.match(/[?&]body=([^&]*)/)?.[1];
    const link = { url: it.url, action: it.action, message: body ? decodeURIComponent(body) : undefined };
    if (deviceSendable(link)) { await sendFromDevice(link); return; }
    window.location.href = it.native_url || it.url;
  }, []);

  const dismiss = useCallback((it: Item) => {
    setItems((xs) => xs.filter((x) => x.id !== it.id));
    void close(it.id, "dismissed");
  }, []);

  if (!items.length) return null;
  const it = items[0];
  return (
    <div className="fixed top-3 inset-x-3 z-[70] rounded-card border border-[#34D399]/40 bg-background-surface/95 backdrop-blur p-3 shadow-lg" role="alert">
      <div className="flex items-start gap-2.5">
        <Smartphone size={16} className="text-[#34D399] mt-0.5 flex-none" />
        <div className="min-w-0 flex-1">
          <p className="text-[11px] hud-label text-[#34D399]">From your other device</p>
          <p className="text-sm text-text-primary truncate">{it.label}</p>
          {it.detail && <p className="text-xs text-text-muted line-clamp-2">{it.detail}</p>}
          <button onClick={() => void open(it)} className="mt-2 px-3 py-1.5 rounded-input text-xs font-semibold text-[#07070F] bg-[#34D399]">Open here</button>
        </div>
        <button onClick={() => dismiss(it)} aria-label="Dismiss" className="text-text-muted hover:text-text-primary"><X size={14} /></button>
      </div>
    </div>
  );
}
