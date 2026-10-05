export const ACTIVATION_LS = "jarvis_activation_config";
export const ACTIVATION_EVENT = "te:activation-change";
export const ACTIVATE_EVENT = "te:activate-assistant";

export const WAKE_PRESETS = ["Hey Jarvis", "Friday", "Edith"] as const;

export type GestureId = "shake" | "double_tap" | "swipe_up";

export interface Hotkey {
  mod: boolean;
  alt: boolean;
  shift: boolean;
  key: string;
}

export interface ActivationConfig {
  wakeWordEnabled: boolean;
  selectedWakeWord: string;
  wakeWordSensitivity: number;
  gestureEnabled: boolean;
  selectedGesture: GestureId;
  hapticFeedback: boolean;
  hotkey: Hotkey;
}

export const DEFAULT_CONFIG: ActivationConfig = {
  wakeWordEnabled: true,
  selectedWakeWord: "Hey Jarvis",
  wakeWordSensitivity: 0.7,
  gestureEnabled: true,
  selectedGesture: "shake",
  hapticFeedback: true,
  hotkey: { mod: true, alt: false, shift: false, key: "j" },
};

const GESTURES: GestureId[] = ["shake", "double_tap", "swipe_up"];

function isHotkey(v: unknown): v is Hotkey {
  if (!v || typeof v !== "object") return false;
  const h = v as Hotkey;
  return typeof h.mod === "boolean" && typeof h.alt === "boolean"
    && typeof h.shift === "boolean" && typeof h.key === "string" && h.key.length > 0;
}

export function parseHotkeyString(raw: string): Hotkey | null {
  const parts = raw.split("+").map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return null;
  const key = parts[parts.length - 1].toLowerCase();
  if (!key) return null;
  const mods = new Set(parts.slice(0, -1).map((p) => p.toLowerCase()));
  return {
    mod: mods.has("cmd") || mods.has("ctrl") || mods.has("meta") || mods.has("mod") || mods.has("⌘"),
    alt: mods.has("alt") || mods.has("option") || mods.has("opt"),
    shift: mods.has("shift"),
    key: key === "space" || key === "spacebar" ? " " : key,
  };
}

function coerce(raw: unknown): ActivationConfig {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_CONFIG };
  const o = raw as Record<string, unknown>;
  const gesture = GESTURES.includes(o.selectedGesture as GestureId)
    ? o.selectedGesture as GestureId
    : DEFAULT_CONFIG.selectedGesture;
  let hotkey = isHotkey(o.hotkey) ? o.hotkey : null;
  if (!hotkey && typeof o.keyboardShortcut === "string") hotkey = parseHotkeyString(o.keyboardShortcut);
  const sensitivity = typeof o.wakeWordSensitivity === "number"
    ? Math.min(1, Math.max(0.2, o.wakeWordSensitivity))
    : DEFAULT_CONFIG.wakeWordSensitivity;
  return {
    wakeWordEnabled: typeof o.wakeWordEnabled === "boolean" ? o.wakeWordEnabled : DEFAULT_CONFIG.wakeWordEnabled,
    selectedWakeWord: typeof o.selectedWakeWord === "string" && o.selectedWakeWord.trim()
      ? o.selectedWakeWord.trim()
      : DEFAULT_CONFIG.selectedWakeWord,
    wakeWordSensitivity: sensitivity,
    gestureEnabled: typeof o.gestureEnabled === "boolean" ? o.gestureEnabled : DEFAULT_CONFIG.gestureEnabled,
    selectedGesture: gesture,
    hapticFeedback: typeof o.hapticFeedback === "boolean" ? o.hapticFeedback : DEFAULT_CONFIG.hapticFeedback,
    hotkey: hotkey ?? { ...DEFAULT_CONFIG.hotkey },
  };
}

function legacyWakeEnabled(): boolean | null {
  try {
    const a = localStorage.getItem("jarvis_wake_enabled");
    if (a === "true") return true;
    if (a === "false") return false;
    const b = localStorage.getItem("jarvis_wakeword");
    if (b === "1") return true;
    if (b === "0") return false;
  } catch { /* private mode */ }
  return null;
}

export function loadActivation(): ActivationConfig {
  if (typeof window === "undefined") return { ...DEFAULT_CONFIG };
  try {
    const raw = localStorage.getItem(ACTIVATION_LS);
    if (raw) return coerce(JSON.parse(raw));
  } catch { /* ignore */ }
  const legacy = legacyWakeEnabled();
  return legacy === null ? { ...DEFAULT_CONFIG } : { ...DEFAULT_CONFIG, wakeWordEnabled: legacy };
}

export function saveActivation(next: ActivationConfig): void {
  if (typeof window === "undefined") return;
  const cfg = coerce(next);
  try { localStorage.setItem(ACTIVATION_LS, JSON.stringify(cfg)); } catch { /* quota */ }
  try { localStorage.setItem("jarvis_wake_enabled", String(cfg.wakeWordEnabled)); } catch { /* noop */ }
  try { localStorage.setItem("jarvis_wakeword", cfg.wakeWordEnabled ? "1" : "0"); } catch { /* noop */ }
  window.dispatchEvent(new Event(ACTIVATION_EVENT));
}

export function activateAssistant(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(ACTIVATE_EVENT));
}

export function phraseTriggers(phrase: string): string[] {
  const n = phrase.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  if (!n) return [];
  const out = new Set<string>([n]);
  n.split(" ").forEach((w) => { if (w.length >= 3) out.add(w); });
  if (n.includes("edith")) {
    out.add("edith");
    out.add("e d i t h");
  }
  return Array.from(out);
}

export function isMac(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform) || /Mac OS/.test(navigator.userAgent);
}

export function formatHotkey(h: Hotkey, mac = isMac()): string {
  const parts: string[] = [];
  if (h.mod) parts.push(mac ? "Cmd" : "Ctrl");
  if (h.alt) parts.push(mac ? "Option" : "Alt");
  if (h.shift) parts.push("Shift");
  parts.push(h.key === " " ? "Space" : h.key.length === 1 ? h.key.toUpperCase() : h.key);
  return parts.join("+");
}

export function matchesHotkey(e: KeyboardEvent, h: Hotkey): boolean {
  const key = e.key === " " ? " " : e.key.toLowerCase();
  if (key !== h.key.toLowerCase()) return false;
  if (h.mod !== (e.metaKey || e.ctrlKey)) return false;
  if (h.alt !== e.altKey) return false;
  if (h.shift !== e.shiftKey) return false;
  return true;
}

export function reservedHotkey(h: Hotkey): boolean {
  return h.mod && !h.alt && !h.shift && h.key.toLowerCase() === "k";
}

export function silencePeak(sensitivity: number): number {
  const s = Math.min(1, Math.max(0.2, sensitivity));
  return 0.028 - s * 0.022;
}

export function hapticIfEnabled(cfg: ActivationConfig): void {
  if (!cfg.hapticFeedback) return;
  try { navigator.vibrate?.(100); } catch { /* unsupported */ }
}
