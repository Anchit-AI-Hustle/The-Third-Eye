"use client";

import { useEffect, useState } from "react";
import { Mic, Camera, MapPin, Bell, X } from "lucide-react";
import { ConsentKey, ConsentState } from "@/lib/consent";
import { useConsentBundle } from "@/hooks/useConsent";

interface ConsentItem {
  key: ConsentKey;
  icon: typeof Mic;
  title: string;
  reason: string;
}

const ITEMS: ConsentItem[] = [
  { key: "microphone",    icon: Mic,     title: "Microphone",    reason: "Voice commands & wake-word (JARVIS / FRIDAY / EDITH)" },
  { key: "location",      icon: MapPin,  title: "Location",      reason: "Local weather, traffic, nearby search — never stored" },
  { key: "notifications", icon: Bell,    title: "Notifications", reason: "Reminders, daily briefings, urgent task alerts" },
  { key: "camera",        icon: Camera,  title: "Camera",        reason: "Vision analysis (EDITH-mode) — describe what you see" },
];

export function ConsentDialog() {
  const { bundleAsked, requestAll } = useConsentBundle();
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<Partial<Record<ConsentKey, ConsentState>>>({});
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Record<ConsentKey, boolean>>({
    microphone: true,
    location: true,
    notifications: true,
    camera: false,
  });

  useEffect(() => {
    if (!bundleAsked) {
      const t = setTimeout(() => setOpen(true), 600);
      return () => clearTimeout(t);
    }
  }, [bundleAsked]);

  if (!open) return null;

  const handleGrant = async () => {
    setBusy(true);
    const keys = (Object.entries(selected).filter(([, v]) => v).map(([k]) => k)) as ConsentKey[];
    const out = await requestAll(keys);
    setResults(out);
    setTimeout(() => setOpen(false), 800);
  };

  const handleSkip = async () => {
    await requestAll([]);
    setOpen(false);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
      <div className="relative w-full max-w-md rounded-2xl border border-[#4FC3F7]/30 bg-[#0A0F1A] shadow-[0_0_60px_rgba(79,195,247,0.25)]">
        <button
          onClick={handleSkip}
          className="absolute top-3 right-3 text-text-muted hover:text-text-primary"
          aria-label="Skip"
        >
          <X size={18} />
        </button>

        <div className="p-6 pb-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-full bg-[#4FC3F7]/10 border border-[#4FC3F7]/40 flex items-center justify-center">
              <div className="w-4 h-4 rounded-full bg-[#4FC3F7] shadow-[0_0_12px_#4FC3F7]" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Activate Assistant</h2>
              <p className="text-xs text-text-muted">Grant once — never asked again unless reset</p>
            </div>
          </div>
        </div>

        <div className="px-6 pb-2 space-y-2">
          {ITEMS.map(({ key, icon: Icon, title, reason }) => {
            const state = results[key];
            return (
              <label
                key={key}
                className="flex items-start gap-3 rounded-xl border border-border-default/60 bg-background-surface/40 p-3 cursor-pointer hover:border-[#4FC3F7]/40 transition-colors"
              >
                <input
                  type="checkbox"
                  checked={selected[key]}
                  onChange={(e) => setSelected((s) => ({ ...s, [key]: e.target.checked }))}
                  disabled={busy}
                  className="mt-1 accent-[#4FC3F7]"
                />
                <Icon size={18} className="mt-0.5 text-[#4FC3F7] shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{title}</span>
                    {state && (
                      <span className={
                        state === "granted" ? "text-[10px] uppercase tracking-wider text-emerald-400"
                        : state === "denied" ? "text-[10px] uppercase tracking-wider text-rose-400"
                        : "text-[10px] uppercase tracking-wider text-text-muted"
                      }>{state}</span>
                    )}
                  </div>
                  <p className="text-xs text-text-muted leading-snug">{reason}</p>
                </div>
              </label>
            );
          })}
        </div>

        <div className="p-6 pt-4 flex gap-2">
          <button
            onClick={handleSkip}
            disabled={busy}
            className="flex-1 h-10 rounded-xl border border-border-default text-sm text-text-muted hover:text-text-primary hover:border-text-primary transition-colors"
          >
            Skip
          </button>
          <button
            onClick={handleGrant}
            disabled={busy}
            className="flex-1 h-10 rounded-xl bg-[#4FC3F7] text-black text-sm font-medium hover:bg-[#4FC3F7]/90 disabled:opacity-50"
          >
            {busy ? "Activating…" : "Grant access"}
          </button>
        </div>
      </div>
    </div>
  );
}
