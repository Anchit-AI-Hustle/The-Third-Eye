"use client";

import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { usePush } from "@/hooks/usePush";

const DISMISSED = "te_notify_prompt_dismissed";

// Offers device notifications (reminders, the morning briefing) once, from a tap.
export function NotifyPrompt() {
  const { state, enable } = usePush();
  const [dismissed, setDismissed] = useState(true);
  useEffect(() => {
    try { setDismissed(localStorage.getItem(DISMISSED) === "1"); } catch { setDismissed(false); }
  }, []);

  if (state !== "off" || dismissed) return null;
  const dismiss = () => {
    setDismissed(true);
    try { localStorage.setItem(DISMISSED, "1"); } catch { /* private mode: it shows again next time */ }
  };
  return (
    <div className="flex items-center gap-3 rounded-input border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-[12.5px] text-text-secondary">
      <Bell size={14} className="flex-none text-accent-blue" />
      <span className="flex-1">Get reminders and your morning briefing as notifications on this device.</span>
      <button type="button" onClick={dismiss} className="text-text-muted hover:text-text-secondary">Not now</button>
      <button type="button" onClick={() => void enable()} className="rounded-input bg-accent-blue/15 px-2.5 py-1 font-medium text-accent-blue hover:bg-accent-blue/25">Turn on</button>
    </div>
  );
}
