"use client";

import { useEffect, useState } from "react";
import { MessageCircle } from "lucide-react";

// Android app only: WhatsApp lets no app send for you, so auto-send is an
// Accessibility switch the person turns on. One tap opens that screen.

type Plugin = { listeningStatus?: () => Promise<{ whatsappAutoSend?: boolean }>; openSettings?: (o: { pane: string }) => Promise<unknown> };
const plugin = (): Plugin | null => {
  const cap = (globalThis as { Capacitor?: { getPlatform?: () => string; Plugins?: Record<string, unknown> } }).Capacitor;
  const p = cap?.getPlatform?.() === "android" ? cap.Plugins?.DeviceControl as Plugin | undefined : undefined;
  return p?.listeningStatus ? p : null;
};

export function WhatsAppAutoSendCard() {
  const [on, setOn] = useState<boolean | null>(null);

  useEffect(() => {
    const p = plugin();
    if (!p) return;
    const check = () => { void p.listeningStatus!().then((s) => setOn(Boolean(s.whatsappAutoSend))).catch(() => {}); };
    check();
    document.addEventListener("visibilitychange", check);
    return () => document.removeEventListener("visibilitychange", check);
  }, []);

  if (on === null) return null;
  return (
    <div className="rounded-card border border-border-default bg-background-surface/40 p-4 space-y-2">
      <div className="flex items-center gap-2"><MessageCircle size={15} className="text-[#34D399]" /><span className="hud-label text-[#34D399]">WhatsApp auto-send &amp; phone control</span></div>
      <p className="text-sm text-text-secondary">
        {on
          ? "On. When you ask JARVIS to WhatsApp someone, here or from your computer, this phone sends it from your own WhatsApp, and JARVIS can lock the screen, go home or back, and take screenshots when you ask."
          : "Off. WhatsApp opens with the message typed and you tap send. Turn on The Third Eye in Accessibility to have it sent for you (including messages you ask for on your computer) and to let JARVIS lock the screen, go home or back, and take screenshots."}
      </p>
      <button onClick={() => void plugin()?.openSettings?.({ pane: "accessibility" })}
        className="px-3 py-1.5 rounded-input text-xs font-semibold text-[#07070F] bg-[#34D399]">
        {on ? "Accessibility settings" : "Turn on"}
      </button>
    </div>
  );
}
