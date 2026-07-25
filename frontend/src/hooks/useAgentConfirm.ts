"use client";

import { useCallback, useState } from "react";

// A sensitive action the agent proposed (send_email / pay / whatsapp / call /
// sms). It is NEVER executed automatically — the user confirms it first, either
// by tapping the ActionCard or (in the voice surface) by saying "confirm".
export interface PendingAction {
  id: string;
  tool: string;
  args: any;
  summary: string;
  status: "pending" | "running" | "done" | "failed" | "canceled";
  result?: string;
  url?: string; // deep link to open on approval (pay/whatsapp/call/sms)
  openLabel?: string; // confirm-button label for a client action
  clientAction?: boolean; // true → open url on the confirming tap (no /api/act)
}

/**
 * Shared confirmation + link-opening logic for the assistant's actions, used by
 * both the full-page assistant and the floating VoiceOverlay so a "confirm"
 * behaves identically everywhere and the two surfaces can never drift apart.
 */
export function useAgentConfirm() {
  const [pendingActions, setPendingActions] = useState<PendingAction[]>([]);
  // Links the agent wanted to open that the browser blocked (iOS/Safari block
  // window.open outside a user gesture) — surfaced as tappable chips.
  const [pendingOpens, setPendingOpens] = useState<{ url: string; label: string }[]>([]);

  const addPending = useCallback((a: PendingAction) => {
    setPendingActions((prev) => [...prev, a]);
  }, []);

  const clearPending = useCallback(() => {
    setPendingActions([]);
    setPendingOpens([]);
  }, []);

  const dismissOpen = useCallback((url: string) => {
    setPendingOpens((p) => p.filter((x) => x.url !== url));
  }, []);

  // open_app / navigate_maps / add_calendar_event → open each http(s) link now;
  // any the browser blocks become tappable chips (one tap = a real gesture).
  const openLinks = useCallback((sideEffects?: { type: string; data?: any }[]) => {
    const opens = (sideEffects ?? []).filter((fx) => fx.type === "open_url" && fx.data?.url);
    if (!opens.length) return;
    const blocked: { url: string; label: string }[] = [];
    for (const fx of opens) {
      const url = String(fx.data.url);
      if (!/^https?:\/\//i.test(url)) continue; // only ever open http(s)
      let win: Window | null = null;
      try {
        win = window.open(url, "_blank", "noopener,noreferrer");
      } catch {
        win = null;
      }
      if (!win) blocked.push({ url, label: fx.data.label || url });
    }
    setPendingOpens(blocked);
  }, []);

  const confirmAction = useCallback(async (action: PendingAction) => {
    // Deep-link intents (pay/whatsapp/call/sms): open the target app on THIS
    // tap (a real user gesture, so iOS allows it). We never execute the payment.
    if (action.clientAction && action.url) {
      const url = action.url;
      try {
        if (/^https?:/i.test(url)) window.open(url, "_blank", "noopener,noreferrer");
        else window.location.href = url; // upi: / tel: / sms: → OS opens the app
      } catch {
        /* noop */
      }
      setPendingActions((prev) =>
        prev.map((a) =>
          a.id === action.id
            ? { ...a, status: "done", result: `Opened ${action.tool === "pay" ? "your payment app" : "the app"} — complete it there.` }
            : a,
        ),
      );
      return;
    }
    setPendingActions((prev) => prev.map((a) => (a.id === action.id ? { ...a, status: "running" } : a)));
    try {
      const res = await fetch("/api/act", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tool: action.tool, args: action.args }),
      });
      const data = await res.json().catch(() => ({}));
      const succeeded = res.ok && data.ok !== false && !data.error;
      const result = data.result ?? data.error ?? (succeeded ? "Done." : "The action was rejected.");
      setPendingActions((prev) =>
        prev.map((a) => (a.id === action.id ? { ...a, status: succeeded ? "done" : "failed", result } : a)),
      );
    } catch {
      setPendingActions((prev) =>
        prev.map((a) =>
          a.id === action.id ? { ...a, status: "failed", result: "Couldn't reach the server — nothing was done." } : a,
        ),
      );
    }
  }, []);

  const cancelAction = useCallback((id: string) => {
    setPendingActions((prev) => prev.map((a) => (a.id === id ? { ...a, status: "canceled" } : a)));
  }, []);

  return {
    pendingActions,
    pendingOpens,
    addPending,
    clearPending,
    dismissOpen,
    openLinks,
    confirmAction,
    cancelAction,
  };
}

// Interpret a spoken transcript as a hands-free response to a pending action.
// Returns "confirm", "cancel", or null (treat as a new message).
export function classifyVoiceConfirm(transcript: string): "confirm" | "cancel" | null {
  const t = transcript.trim().toLowerCase().replace(/[.!,]/g, "");
  if (!t) return null;
  const confirm = /^(confirm|yes|yep|yeah|do it|send it|send|go ahead|approve|approved|confirmed|okay do it|ok do it)$/;
  const cancel = /^(cancel|no|nope|stop|don'?t|abort|never ?mind|discard)$/;
  if (confirm.test(t)) return "confirm";
  if (cancel.test(t)) return "cancel";
  return null;
}
