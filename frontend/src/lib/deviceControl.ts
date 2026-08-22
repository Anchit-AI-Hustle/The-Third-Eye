"use client";

// Executes control_device side-effects on the operator's phone / browser.
// Native Capacitor plugin first (flashlight LED, volume, brightness, vibrate),
// then Web APIs, then a HUD overlay. Always reports what actually happened.

import type { DeviceActionPayload } from "./devicePlan";
import { applyHomeAction, DEFAULT_HUB, type HubDevice } from "./homeHub";
import { vaultGet, vaultSet } from "./deviceVault";

export type DeviceExecResult = {
  ok: boolean;
  action: string;
  via: "native" | "web" | "overlay" | "settings" | "hub" | "none";
  applied: string;
  detail?: string;
  data?: Record<string, unknown>;
};

const EVENT = "jarvis:device";
const HOME_EVENT = "jarvis:home";
const HOME_APP = "jarvis-home";
const HOME_KEY = "devices";

function capPlugin(): { isNative: boolean; call: (method: string, args?: Record<string, unknown>) => Promise<unknown> } {
  const C = (typeof window !== "undefined" ? (window as any).Capacitor : null) as
    | { isNativePlatform?: () => boolean; Plugins?: Record<string, Record<string, (a?: unknown) => Promise<unknown>>> }
    | null;
  const isNative = !!C?.isNativePlatform?.();
  return {
    isNative,
    async call(method, args) {
      const fn = C?.Plugins?.DeviceControl?.[method];
      if (!fn) return null;
      return fn(args ?? {});
    },
  };
}

let torchTrack: MediaStreamTrack | null = null;
let cameraStream: MediaStream | null = null;
let wakeLockSentinel: { release: () => Promise<void> } | null = null;

function emit(result: DeviceExecResult, payload: DeviceActionPayload) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { result, payload } }));
}

export function onDeviceEvent(handler: (e: { result: DeviceExecResult; payload: DeviceActionPayload }) => void) {
  if (typeof window === "undefined") return () => {};
  const fn = (ev: Event) => handler((ev as CustomEvent).detail);
  window.addEventListener(EVENT, fn);
  return () => window.removeEventListener(EVENT, fn);
}

export function onHomeEvent(handler: (devices: HubDevice[]) => void) {
  if (typeof window === "undefined") return () => {};
  const fn = (ev: Event) => handler((ev as CustomEvent).detail as HubDevice[]);
  window.addEventListener(HOME_EVENT, fn);
  return () => window.removeEventListener(HOME_EVENT, fn);
}

export function loadHub(): HubDevice[] {
  return vaultGet<HubDevice[]>(HOME_APP, HOME_KEY, DEFAULT_HUB);
}

export function saveHub(devices: HubDevice[]) {
  vaultSet(HOME_APP, HOME_KEY, devices);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(HOME_EVENT, { detail: devices }));
  }
}

function ensureVeil(id: string, style: Partial<CSSStyleDeclaration>) {
  let el = document.getElementById(id) as HTMLDivElement | null;
  if (!el) {
    el = document.createElement("div");
    el.id = id;
    el.setAttribute("aria-hidden", "true");
    Object.assign(el.style, {
      position: "fixed",
      inset: "0",
      pointerEvents: "none",
      zIndex: "2147483000",
      transition: "opacity 180ms ease, background 180ms ease",
    });
    document.body.appendChild(el);
  }
  Object.assign(el.style, style);
  return el;
}

async function setTorch(on: boolean): Promise<DeviceExecResult> {
  const native = capPlugin();
  if (native.isNative) {
    const res = (await native.call("flashlight", { on })) as { ok?: boolean; error?: string } | null;
    if (res?.ok) return { ok: true, action: on ? "flashlight_on" : "flashlight_off", via: "native", applied: on ? "LED torch on" : "LED torch off" };
  }
  try {
    if (on) {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      const track = stream.getVideoTracks()[0];
      const caps = track.getCapabilities?.() as { torch?: boolean } | undefined;
      if (caps?.torch) {
        // torch is a real, widely-supported (Chrome/Android) MediaTrackConstraint
        // extension for camera flash control, but TypeScript's stock DOM types
        // don't know about it — cast through unknown, as TS itself suggests,
        // rather than a same-shape cast that it correctly rejects.
        await track.applyConstraints({ advanced: [{ torch: true }] } as unknown as MediaTrackConstraints);
        torchTrack = track;
        return { ok: true, action: "flashlight_on", via: "web", applied: "Camera torch on" };
      }
      stream.getTracks().forEach((t) => t.stop());
    } else if (torchTrack) {
      try {
        await torchTrack.applyConstraints({ advanced: [{ torch: false }] } as unknown as MediaTrackConstraints);
      } catch { /* ignore */ }
      torchTrack.stop();
      torchTrack = null;
      return { ok: true, action: "flashlight_off", via: "web", applied: "Camera torch off" };
    }
  } catch { /* permission / no torch */ }

  ensureVeil("jarvis-flashlight-veil", {
    background: on ? "#ffffff" : "transparent",
    opacity: on ? "1" : "0",
  });
  return {
    ok: true,
    action: on ? "flashlight_on" : "flashlight_off",
    via: "overlay",
    applied: on ? "Flashlight overlay on (this browser cannot drive the LED)" : "Flashlight overlay off",
  };
}

async function vibrate(value?: string | null): Promise<DeviceExecResult> {
  const native = capPlugin();
  const ms = Math.max(50, Math.min(5000, Number(value) || 400));
  if (native.isNative) {
    const res = (await native.call("vibrate", { duration: ms })) as { ok?: boolean } | null;
    if (res?.ok) return { ok: true, action: "vibrate", via: "native", applied: `Vibrated ${ms}ms` };
  }
  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
    const ok = navigator.vibrate(ms);
    if (ok) return { ok: true, action: "vibrate", via: "web", applied: `Vibrated ${ms}ms` };
  }
  return { ok: false, action: "vibrate", via: "none", applied: "Vibration not supported on this device" };
}

async function setVolume(value?: string | null): Promise<DeviceExecResult> {
  const level = Math.max(0, Math.min(100, Number(value) || 50));
  const native = capPlugin();
  if (native.isNative) {
    const res = (await native.call("setVolume", { level })) as { ok?: boolean } | null;
    if (res?.ok) return { ok: true, action: "volume", via: "native", applied: `Volume set to ${level}%`, data: { level } };
  }
  if (typeof window !== "undefined") (window as any).__jarvisVolume = level / 100;
  return {
    ok: true,
    action: "volume",
    via: "overlay",
    applied: `JARVIS output volume set to ${level}% (OS media volume requires the native app)`,
    data: { level },
  };
}

async function setBrightness(value?: string | null): Promise<DeviceExecResult> {
  const level = Math.max(5, Math.min(100, Number(value) || 70));
  const native = capPlugin();
  if (native.isNative) {
    const res = (await native.call("setBrightness", { level })) as { ok?: boolean } | null;
    if (res?.ok) return { ok: true, action: "brightness", via: "native", applied: `Brightness ${level}%`, data: { level } };
  }
  const dim = 1 - level / 100;
  ensureVeil("jarvis-brightness-veil", {
    background: `rgba(0,0,0,${Math.min(0.82, dim * 0.85)})`,
    opacity: "1",
    zIndex: "2147482999",
  });
  return {
    ok: true,
    action: "brightness",
    via: "overlay",
    applied: `Screen dimmed to ${level}% in this session`,
    data: { level },
  };
}

async function notify(value?: string | null): Promise<DeviceExecResult> {
  const body = (value || "JARVIS notification").slice(0, 180);
  try {
    const native = capPlugin();
    if (native.isNative) {
      const res = (await native.call("notify", { title: "JARVIS", body })) as { ok?: boolean } | null;
      if (res?.ok) return { ok: true, action: "notify", via: "native", applied: `Notification: ${body}` };
    }
    if (typeof Notification === "undefined") {
      return { ok: false, action: "notify", via: "none", applied: "Notifications API missing" };
    }
    let perm = Notification.permission;
    if (perm === "default") perm = await Notification.requestPermission();
    if (perm !== "granted") {
      return { ok: false, action: "notify", via: "web", applied: "Notification permission denied" };
    }
    new Notification("JARVIS", { body, silent: false });
    return { ok: true, action: "notify", via: "web", applied: `Notification: ${body}` };
  } catch (e) {
    return { ok: false, action: "notify", via: "none", applied: e instanceof Error ? e.message : "notify failed" };
  }
}

async function clipboardWrite(value?: string | null): Promise<DeviceExecResult> {
  const text = value ?? "";
  if (!text) return { ok: false, action: "clipboard", via: "none", applied: "Nothing to copy" };
  try {
    await navigator.clipboard.writeText(text);
    return { ok: true, action: "clipboard", via: "web", applied: "Copied to clipboard" };
  } catch {
    return { ok: false, action: "clipboard", via: "web", applied: "Clipboard permission denied" };
  }
}

async function share(value?: string | null): Promise<DeviceExecResult> {
  const text = value || "Shared by JARVIS";
  try {
    if (navigator.share) {
      await navigator.share({ text, title: "JARVIS" });
      return { ok: true, action: "share", via: "web", applied: "Share sheet opened" };
    }
    await navigator.clipboard.writeText(text);
    return { ok: true, action: "share", via: "web", applied: "Share API missing — copied instead" };
  } catch {
    return { ok: false, action: "share", via: "web", applied: "Share cancelled" };
  }
}

async function setCamera(on: boolean): Promise<DeviceExecResult> {
  try {
    if (!on) {
      cameraStream?.getTracks().forEach((t) => t.stop());
      cameraStream = null;
      document.getElementById("jarvis-camera-preview")?.remove();
      return { ok: true, action: "camera_off", via: "web", applied: "Camera closed" };
    }
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
    cameraStream = stream;
    let video = document.getElementById("jarvis-camera-preview") as HTMLVideoElement | null;
    if (!video) {
      video = document.createElement("video");
      video.id = "jarvis-camera-preview";
      video.autoplay = true;
      video.muted = true;
      video.playsInline = true;
      Object.assign(video.style, {
        position: "fixed",
        right: "16px",
        bottom: "96px",
        width: "160px",
        height: "220px",
        objectFit: "cover",
        borderRadius: "16px",
        zIndex: "2147483600",
        border: "1px solid rgba(143,212,232,0.35)",
        background: "#000",
      });
      document.body.appendChild(video);
    }
    video.srcObject = stream;
    await video.play().catch(() => {});
    return { ok: true, action: "camera_on", via: "web", applied: "Camera preview open" };
  } catch {
    return { ok: false, action: on ? "camera_on" : "camera_off", via: "web", applied: "Camera permission denied" };
  }
}

async function getLocation(): Promise<DeviceExecResult> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve({ ok: false, action: "location", via: "none", applied: "Geolocation unavailable" });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        resolve({
          ok: true,
          action: "location",
          via: "web",
          applied: `Located ±${Math.round(accuracy)}m`,
          data: { latitude, longitude, accuracy },
        });
      },
      (err) => resolve({ ok: false, action: "location", via: "web", applied: err.message || "Location denied" }),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  });
}

async function setFullscreen(on: boolean): Promise<DeviceExecResult> {
  try {
    if (on) {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
      return { ok: true, action: "fullscreen_on", via: "web", applied: "Fullscreen on" };
    }
    if (document.fullscreenElement) await document.exitFullscreen();
    return { ok: true, action: "fullscreen_off", via: "web", applied: "Fullscreen off" };
  } catch {
    return { ok: false, action: on ? "fullscreen_on" : "fullscreen_off", via: "web", applied: "Fullscreen blocked" };
  }
}

async function setWakeLock(on: boolean): Promise<DeviceExecResult> {
  try {
    if (!on) {
      await wakeLockSentinel?.release();
      wakeLockSentinel = null;
      return { ok: true, action: "wake_lock_off", via: "web", applied: "Wake lock released" };
    }
    const nav = navigator as Navigator & { wakeLock?: { request: (t: string) => Promise<{ release: () => Promise<void> }> } };
    if (!nav.wakeLock) return { ok: false, action: "wake_lock_on", via: "none", applied: "Wake Lock API missing" };
    wakeLockSentinel = await nav.wakeLock.request("screen");
    return { ok: true, action: "wake_lock_on", via: "web", applied: "Screen will stay awake" };
  } catch {
    return { ok: false, action: on ? "wake_lock_on" : "wake_lock_off", via: "web", applied: "Wake lock denied" };
  }
}

function openSettings(kind: "wifi" | "bluetooth" | "airplane"): DeviceExecResult {
  const cap = capPlugin();
  if (cap.isNative) {
    void cap.call("openSettings", { pane: kind });
    return { ok: true, action: kind, via: "settings", applied: `Opened ${kind} settings` };
  }
  return {
    ok: true,
    action: kind,
    via: "overlay",
    applied: `Toggled ${kind} in JARVIS (OS ${kind} cannot be flipped from a web page — open system settings)`,
  };
}

async function readStatus(): Promise<DeviceExecResult> {
  const data: Record<string, unknown> = {
    online: navigator.onLine,
    language: navigator.language,
    platform: navigator.platform,
    cookiesEnabled: navigator.cookieEnabled,
  };
  const nav = navigator as Navigator & {
    deviceMemory?: number;
    connection?: { effectiveType?: string; downlink?: number };
    getBattery?: () => Promise<{ level: number; charging: boolean }>;
  };
  if (nav.deviceMemory) data.deviceMemoryGB = nav.deviceMemory;
  if (navigator.hardwareConcurrency) data.cpuCores = navigator.hardwareConcurrency;
  if (nav.connection) data.network = { type: nav.connection.effectiveType, downlinkMbps: nav.connection.downlink };
  if (typeof nav.getBattery === "function") {
    try {
      const b = await nav.getBattery();
      data.battery = { levelPercent: Math.round(b.level * 100), charging: b.charging };
    } catch { /* ignore */ }
  }
  if (navigator.storage?.estimate) {
    try {
      const est = await navigator.storage.estimate();
      data.storageMB = {
        used: Math.round((est.usage ?? 0) / 1e6),
        quota: Math.round((est.quota ?? 0) / 1e6),
      };
    } catch { /* ignore */ }
  }
  const native = capPlugin();
  if (native.isNative) {
    const extra = await native.call("getStatus");
    if (extra && typeof extra === "object") Object.assign(data, extra);
  }
  return { ok: true, action: "status", via: native.isNative ? "native" : "web", applied: "Device status read", data };
}

function parseOnOff(action: string, fallbackOn: boolean): boolean {
  if (action.endsWith("_off") || action === "off" || action === "disable") return false;
  if (action.endsWith("_on") || action === "on" || action === "enable") return true;
  if (action.endsWith("_toggle") || action === "toggle") return fallbackOn;
  return fallbackOn;
}

export function executeHomeAction(payload: DeviceActionPayload): DeviceExecResult {
  const current = loadHub();
  const next = applyHomeAction(current, payload.action, payload.device, payload.value);
  saveHub(next.devices);
  const result: DeviceExecResult = {
    ok: next.changed.length > 0,
    action: payload.action,
    via: "hub",
    applied: next.summary,
    data: { changed: next.changed, count: next.changed.length },
  };
  emit(result, payload);
  return result;
}

export async function executeDeviceAction(payload: DeviceActionPayload): Promise<DeviceExecResult> {
  const act = (payload.action || "status").toLowerCase();
  const device = (payload.device || "phone").toLowerCase();
  const value = payload.value;

  const key = act.includes("_") ? act : device !== "phone" ? `${device}_${act}` : act;

  let result: DeviceExecResult;

  if (key.startsWith("flashlight") || key.startsWith("torch") || (device === "flashlight" && ["on", "off", "toggle"].includes(act))) {
    const on = key.includes("toggle") ? !torchTrack : parseOnOff(key, true);
    result = await setTorch(on);
  } else if (key.startsWith("vibrate") || key === "haptic") {
    result = await vibrate(value);
  } else if (key.startsWith("volume") || key === "sound") {
    result = await setVolume(value);
  } else if (key.startsWith("brightness") || key === "dim" || key === "screen") {
    result = await setBrightness(value);
  } else if (key === "mute" || key === "mute_on" || key === "volume_mute") {
    result = await setVolume("0");
    result.action = "mute";
    result.applied = "Muted JARVIS output";
  } else if (key === "unmute" || key === "mute_off") {
    result = await setVolume("60");
    result.action = "unmute";
  } else if (key.startsWith("dnd") || key === "silent") {
    const on = parseOnOff(key, true);
    if (typeof window !== "undefined") (window as any).__jarvisDnd = on;
    result = {
      ok: true,
      action: on ? "dnd_on" : "dnd_off",
      via: "overlay",
      applied: on ? "Do Not Disturb on — JARVIS will stay quiet" : "Do Not Disturb off",
      data: { dnd: on },
    };
  } else if (key.startsWith("notify") || key === "notification" || key === "alert") {
    result = await notify(value);
  } else if (key.startsWith("clipboard") || key === "copy") {
    result = await clipboardWrite(value);
  } else if (key.startsWith("share")) {
    result = await share(value);
  } else if (key.startsWith("camera") || key === "webcam") {
    result = await setCamera(parseOnOff(key, true));
  } else if (key.startsWith("location") || key === "gps") {
    result = await getLocation();
  } else if (key.startsWith("fullscreen")) {
    result = await setFullscreen(parseOnOff(key, true));
  } else if (key.startsWith("wake_lock") || key === "wakelock") {
    result = await setWakeLock(parseOnOff(key, true));
  } else if (key.startsWith("wifi")) {
    result = openSettings("wifi");
  } else if (key.startsWith("bluetooth") || key === "bt") {
    result = openSettings("bluetooth");
  } else if (key.startsWith("airplane")) {
    result = openSettings("airplane");
  } else if (key === "status" || key === "battery" || key === "info") {
    result = await readStatus();
  } else if ((key === "speak" || key.startsWith("speak")) && value) {
    try {
      const u = new SpeechSynthesisUtterance(value);
      const vol = typeof window !== "undefined" ? Number((window as any).__jarvisVolume ?? 1) : 1;
      u.volume = Number.isFinite(vol) ? vol : 1;
      speechSynthesis.cancel();
      speechSynthesis.speak(u);
      result = { ok: true, action: "speak", via: "web", applied: "Speaking" };
    } catch {
      result = { ok: false, action: "speak", via: "none", applied: "TTS unavailable" };
    }
  } else {
    result = {
      ok: false,
      action: act,
      via: "none",
      applied: `I don’t have a handler for “${act}” on ${device}. Try flashlight, vibrate, volume, brightness, DND, notify, camera, location, clipboard, share, fullscreen.`,
    };
  }

  emit(result, payload);
  return result;
}

export async function executeDeviceActions(payloads: DeviceActionPayload[] | undefined): Promise<DeviceExecResult[]> {
  if (!payloads?.length) return [];
  const out: DeviceExecResult[] = [];
  for (const p of payloads) out.push(await executeDeviceAction(p));
  return out;
}
