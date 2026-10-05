"use client";

import { useEffect, useState } from "react";
import { Mic, Smartphone, Keyboard, Sparkles, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useActivationConfig } from "@/hooks/useActivationConfig";
import { maybeRequestShake } from "@/hooks/useJarvisTriggers";
import {
  WAKE_PRESETS,
  formatHotkey,
  reservedHotkey,
  type GestureId,
  type Hotkey,
} from "@/lib/activation";

const GESTURES: { id: GestureId; label: string; desc: string }[] = [
  { id: "shake", label: "Device Shake", desc: "Shake your phone firmly twice" },
  { id: "swipe_up", label: "Swipe Up from Nav", desc: "Swipe up from the bottom assistant orb" },
  { id: "double_tap", label: "Two-Finger Tap", desc: "Tap anywhere on the screen with two fingers" },
];

export function ActivationSettings() {
  const { config, update } = useActivationConfig();
  const [saved, setSaved] = useState(false);
  const [customOn, setCustomOn] = useState(() => !WAKE_PRESETS.includes(config.selectedWakeWord as typeof WAKE_PRESETS[number]));
  const [customDraft, setCustomDraft] = useState(() => customOn ? config.selectedWakeWord : "");
  const [recording, setRecording] = useState(false);

  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(false), 2000);
    return () => clearTimeout(t);
  }, [saved]);

  function set<K extends keyof typeof config>(key: K, value: (typeof config)[K]) {
    update(key, value);
    setSaved(true);
  }

  useEffect(() => {
    if (!recording) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") { setRecording(false); return; }
      if (e.repeat) return;
      const key = e.key === " " ? " " : e.key.length === 1 ? e.key.toLowerCase() : "";
      if (!key) return;
      if (!e.metaKey && !e.ctrlKey && !e.altKey) return;
      const next: Hotkey = {
        mod: e.metaKey || e.ctrlKey,
        alt: e.altKey,
        shift: e.shiftKey,
        key,
      };
      if (reservedHotkey(next)) return;
      set("hotkey", next);
      setRecording(false);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [recording]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between pb-1">
        <div>
          <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
            <Sparkles size={15} className="text-accent-blue" />
            Assistant activation
          </h2>
          <p className="text-xs text-text-muted mt-0.5">
            Wake word, phone gestures, and a desktop hotkey — from any screen.
          </p>
        </div>
        {saved && (
          <span className="text-xs text-success flex items-center gap-1 font-mono">
            <Check size={13} /> Saved
          </span>
        )}
      </div>

      <section className="bg-background-surface border border-border-default rounded-card p-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-input bg-accent-blue/10 text-accent-blue">
              <Mic size={16} />
            </div>
            <div>
              <h3 className="text-sm font-medium text-text-primary">Voice activation</h3>
              <p className="text-xs text-text-muted">Always-on wake word</p>
            </div>
          </div>
          <Toggle enabled={config.wakeWordEnabled} onChange={(v) => set("wakeWordEnabled", v)} />
        </div>

        {config.wakeWordEnabled && (
          <div className="pt-3 border-t border-border-default space-y-3">
            <div>
              <p className="text-xs text-text-muted mb-1.5">Wake phrase</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {WAKE_PRESETS.map((phrase) => (
                  <button
                    key={phrase}
                    type="button"
                    onClick={() => { setCustomOn(false); set("selectedWakeWord", phrase); }}
                    className={cn(
                      "py-2 px-3 rounded-input text-xs font-medium border transition-colors",
                      !customOn && config.selectedWakeWord === phrase
                        ? "bg-accent-blue/15 border-accent-blue/50 text-accent-blue"
                        : "bg-background-elevated border-border-default text-text-muted hover:text-text-primary"
                    )}
                  >
                    “{phrase}”
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setCustomOn(true)}
                  className={cn(
                    "py-2 px-3 rounded-input text-xs font-medium border transition-colors",
                    customOn
                      ? "bg-accent-blue/15 border-accent-blue/50 text-accent-blue"
                      : "bg-background-elevated border-border-default text-text-muted hover:text-text-primary"
                  )}
                >
                  Custom
                </button>
              </div>
              {customOn && (
                <input
                  value={customDraft}
                  onChange={(e) => setCustomDraft(e.target.value)}
                  onBlur={() => { const v = customDraft.trim(); if (v) set("selectedWakeWord", v); }}
                  onKeyDown={(e) => { if (e.key === "Enter") { const v = customDraft.trim(); if (v) set("selectedWakeWord", v); } }}
                  placeholder="Your phrase"
                  className="mt-2 w-full bg-background-base border border-border-default rounded-input px-3 py-2 text-sm text-text-primary outline-none focus:border-accent-blue/50"
                />
              )}
            </div>

            <div>
              <div className="flex justify-between text-xs text-text-muted mb-1">
                <span>Mic sensitivity</span>
                <span className="font-mono">{Math.round(config.wakeWordSensitivity * 100)}%</span>
              </div>
              <input
                type="range"
                min="0.2"
                max="1.0"
                step="0.05"
                value={config.wakeWordSensitivity}
                onChange={(e) => set("wakeWordSensitivity", parseFloat(e.target.value))}
                className="w-full h-1.5 bg-background-elevated rounded-input appearance-none cursor-pointer accent-[#4FC3F7]"
              />
            </div>
          </div>
        )}
      </section>

      <section className="bg-background-surface border border-border-default rounded-card p-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-input bg-accent-blue/10 text-accent-blue">
              <Smartphone size={16} />
            </div>
            <div>
              <h3 className="text-sm font-medium text-text-primary">Gesture activation</h3>
              <p className="text-xs text-text-muted">Motion and touch on mobile</p>
            </div>
          </div>
          <Toggle
            enabled={config.gestureEnabled}
            onChange={(v) => {
              set("gestureEnabled", v);
              if (v) maybeRequestShake({ ...config, gestureEnabled: v });
            }}
          />
        </div>

        {config.gestureEnabled && (
          <div className="pt-3 border-t border-border-default space-y-3">
            <div className="space-y-2">
              {GESTURES.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => {
                    set("selectedGesture", g.id);
                    if (g.id === "shake") maybeRequestShake({ ...config, selectedGesture: g.id });
                  }}
                  className={cn(
                    "flex items-start justify-between w-full p-3 rounded-input border text-left transition-colors",
                    config.selectedGesture === g.id
                      ? "bg-accent-blue/10 border-accent-blue/40 text-text-primary"
                      : "bg-background-elevated border-border-default text-text-secondary hover:text-text-primary"
                  )}
                >
                  <div>
                    <span className="text-xs font-semibold block">{g.label}</span>
                    <span className="text-[11px] text-text-muted">{g.desc}</span>
                  </div>
                  {config.selectedGesture === g.id && <Check size={14} className="text-accent-blue flex-none mt-0.5" />}
                </button>
              ))}
            </div>
            <div className="flex items-center justify-between pt-1">
              <span className="text-xs text-text-muted">Haptic vibration on trigger</span>
              <Toggle enabled={config.hapticFeedback} onChange={(v) => set("hapticFeedback", v)} />
            </div>
          </div>
        )}
      </section>

      <section className="bg-background-surface border border-border-default rounded-card p-5 space-y-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-input bg-accent-blue/10 text-accent-blue">
            <Keyboard size={16} />
          </div>
          <div>
            <h3 className="text-sm font-medium text-text-primary">Keyboard shortcut</h3>
            <p className="text-xs text-text-muted">Quick launch on desktop — Cmd+K is the command palette</p>
          </div>
        </div>
        <div className="flex items-center justify-between pt-1">
          <span className="text-xs text-text-muted">Global activation hotkey</span>
          <button
            type="button"
            onClick={() => setRecording(true)}
            className={cn(
              "px-3 py-1.5 rounded-input border font-mono text-xs font-semibold",
              recording
                ? "bg-accent-blue/15 border-accent-blue/50 text-accent-blue"
                : "bg-background-elevated border-border-default text-accent-blue hover:border-accent-blue/40"
            )}
          >
            {recording ? "Press a shortcut…" : formatHotkey(config.hotkey)}
          </button>
        </div>
      </section>
    </div>
  );
}

function Toggle({ enabled, onChange }: { enabled: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      onClick={() => onChange(!enabled)}
      className={cn(
        "w-9 h-5 rounded-full relative transition-colors flex-none",
        enabled ? "bg-accent-blue" : "bg-background-elevated border border-border-default"
      )}
    >
      <span className={cn(
        "absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform",
        enabled ? "translate-x-4" : "translate-x-0.5"
      )} />
    </button>
  );
}
