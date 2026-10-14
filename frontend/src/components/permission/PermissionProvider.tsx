"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import {
  Mic,
  Camera,
  Monitor,
  MapPin,
  Bell,
  ShieldCheck,
  FileDown,
  Clipboard,
  Activity,
  Eye,
  Vibrate,
  Radio,
  BatteryCharging,
  Contact,
} from "lucide-react";
import {
  PermissionCapability, getPolicy, setPolicy,
} from "@/lib/consent";
import { ensureCapability, registerPermissionUI } from "@/lib/permissionGate";

// Central permission gate. A feature that needs a device capability calls
//   const ok = await requestCapability("camera");
// and only proceeds if ok. Behaviour:
//   • policy "always"  → resolve true immediately (the OS still owns the real
//                        prompt; we just don't re-ask at the app layer).
//   • otherwise        → show the sheet with three choices:
//        Allow every time → persist policy "always", resolve true
//        Allow once       → resolve true, do not persist (asks again next time)
//        Not now          → resolve false (asks again next time)

interface CapMeta {
  label: string;
  icon: typeof Mic;
  reason: string;
  /** False when the browser shows no prompt of its own (the app's choice is the only gate). */
  devicePrompt?: false;
}

export const CAP_META: Record<PermissionCapability, CapMeta> = {
  microphone:    { label: "Microphone",    icon: Mic,     reason: "Hear you for voice commands, dictation and live capture." },
  camera:        { label: "Camera",        icon: Camera,  reason: "See what you point it at, so the assistant can describe or act on it." },
  screen:        { label: "Screen",        icon: Monitor, reason: "Read a window or tab you share so the assistant can analyse it." },
  location:      { label: "Location",      icon: MapPin,  reason: "Use where you are for local weather, traffic and nearby search." },
  notifications: { label: "Notifications", icon: Bell,    reason: "Send reminders, daily briefings and urgent task alerts." },
  files:         { label: "Save & open files", icon: FileDown, reason: "Save files JARVIS makes for you to your Downloads folder and open them in a new tab.", devicePrompt: false },
  clipboard:     { label: "Clipboard & Quick Actions", icon: Clipboard, reason: "Read copied text to analyze, and copy code or links directly for you." },
  motion:        { label: "Motion & Physical Gestures", icon: Activity, reason: "Detect physical gestures (e.g. shake to activate JARVIS, double tap, device tilts)." },
  wakeLock:      { label: "Stay Awake / Wake Lock", icon: Eye, reason: "Keep the screen active during hands-free calls, voice briefings, and active protocols.", devicePrompt: false },
  vibration:     { label: "Haptic Alerts & Vibration", icon: Vibrate, reason: "Vibrate your device for timer alarms, critical alerts, and voice confirmations.", devicePrompt: false },
  bluetooth:     { label: "Bluetooth & Smart Hub", icon: Radio, reason: "Connect to local smart home hubs, IoT devices, and Bluetooth peripherals." },
  battery:       { label: "Battery & Power Diagnostics", icon: BatteryCharging, reason: "Monitor device battery levels to warn of low power and optimize tasks.", devicePrompt: false },
  contacts:      { label: "Contacts & Direct Outreach", icon: Contact, reason: "Access contacts for instant phone dialing, WhatsApp, and SMS outreach." },
};

type Resolver = (ok: boolean) => void;

interface PermissionCtx {
  requestCapability: (cap: PermissionCapability) => Promise<boolean>;
}

const Ctx = createContext<PermissionCtx | null>(null);

export function PermissionProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<PermissionCapability | null>(null);
  const resolverRef = useRef<Resolver | null>(null);

  const finish = useCallback((ok: boolean, remember: boolean) => {
    const cap = pending;
    if (cap && remember && ok) setPolicy(cap, "always");
    setPending(null);
    resolverRef.current?.(ok);
    resolverRef.current = null;
  }, [pending]);

  // Shows the sheet and resolves with the user's choice. Registered globally so
  // non-React callers reach it via ensureCapability().
  const openSheet = useCallback((cap: PermissionCapability): Promise<boolean> => {
    if (getPolicy(cap) === "always") return Promise.resolve(true);
    // If another prompt is already open, deny the new one rather than
    // clobbering the in-flight resolver.
    if (resolverRef.current) return Promise.resolve(false);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
      setPending(cap);
    });
  }, []);

  useEffect(() => registerPermissionUI(openSheet), [openSheet]);

  const meta = pending ? CAP_META[pending] : null;
  const Icon = meta?.icon ?? ShieldCheck;

  return (
    <Ctx.Provider value={{ requestCapability: ensureCapability }}>
      {children}
      {pending && meta && (
        <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          role="dialog" aria-modal="true" aria-label={`Allow ${meta.label}`}>
          <div className="w-full max-w-sm rounded-2xl border border-[#4FC3F7]/25 bg-[#0A0F1A] shadow-[0_0_50px_rgba(79,195,247,0.2)] overflow-hidden">
            <div className="p-6 pb-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-11 h-11 rounded-xl bg-[#4FC3F7]/10 border border-[#4FC3F7]/30 flex items-center justify-center flex-none">
                  <Icon size={20} className="text-[#4FC3F7]" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-base font-semibold text-text-primary">Allow {meta.label}?</h2>
                  <p className="text-xs text-text-muted">The Third Eye is asking for access</p>
                </div>
              </div>
              <p className="text-sm text-text-secondary leading-relaxed">{meta.reason}</p>
              <p className="text-[11px] text-text-muted mt-2 leading-relaxed">
                {meta.devicePrompt === false ? "" : "Your device will ask you to confirm too. "}Choose how The Third Eye should remember it:
              </p>
            </div>
            <div className="px-4 pb-4 space-y-2">
              <button
                onClick={() => finish(true, true)}
                className="w-full flex items-center justify-between gap-2 px-4 h-11 rounded-xl bg-[#4FC3F7] text-[#07070F] text-sm font-semibold hover:brightness-110 transition"
              >
                Allow every time
                <span className="text-[10px] font-mono opacity-70">won&apos;t ask again</span>
              </button>
              <button
                onClick={() => finish(true, false)}
                className="w-full flex items-center justify-between gap-2 px-4 h-11 rounded-xl border border-[#4FC3F7]/40 bg-[#4FC3F7]/10 text-[#4FC3F7] text-sm font-medium hover:bg-[#4FC3F7]/20 transition"
              >
                Allow once
                <span className="text-[10px] font-mono opacity-70">asks next time</span>
              </button>
              <button
                onClick={() => finish(false, false)}
                className="w-full px-4 h-11 rounded-xl border border-border-default text-text-secondary text-sm hover:text-text-primary hover:border-text-primary transition"
              >
                Not now
              </button>
            </div>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}

export function useCapability() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useCapability must be used within PermissionProvider");
  return v.requestCapability;
}
