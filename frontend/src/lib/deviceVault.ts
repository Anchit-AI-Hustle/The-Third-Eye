"use client";

// Device-local vault. The "biggest difference" the product wants: self-built
// apps keep their data ON THE DEVICE, namespaced under a stable device ID. The
// ID lets the app map + load all of a device's local data (and could later be
// used to sync only when that device is connected/authorized). Nothing here
// leaves the browser — it's localStorage keyed by the device id.
//
// This complements the existing cloud data API: cloud sync stays opt-in per
// feature; the device vault is the always-available, private-by-default store.

const DEVICE_ID_KEY = "te_device_id_v1";

/** Stable per-device id (created once, persisted locally). */
export function getDeviceId(): string {
  if (typeof window === "undefined") return "server";
  try {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id = `dev_${(crypto.randomUUID?.() || Math.random().toString(36).slice(2) + Date.now().toString(36)).replace(/-/g, "")}`;
      localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  } catch {
    return "dev_ephemeral";
  }
}

/** Short, human-readable form of the device id for display. */
export function shortDeviceId(): string {
  const id = getDeviceId();
  return id.length > 10 ? `${id.slice(0, 7)}…${id.slice(-4)}` : id;
}

function nsKey(appId: string, key: string): string {
  return `te_vault:${getDeviceId()}:${appId}:${key}`;
}

/** Read a device-local value for an app. */
export function vaultGet<T>(appId: string, key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(nsKey(appId, key));
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

/** Write a device-local value for an app. */
export function vaultSet(appId: string, key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(nsKey(appId, key), JSON.stringify(value));
  } catch {
    /* quota / disabled — device vault is best-effort */
  }
}

/** Remove one key. */
export function vaultRemove(appId: string, key: string): void {
  if (typeof window === "undefined") return;
  try { localStorage.removeItem(nsKey(appId, key)); } catch { /* noop */ }
}

/** List all vault keys for the current device (for export / a data map). */
export function vaultKeys(): string[] {
  if (typeof window === "undefined") return [];
  const prefix = `te_vault:${getDeviceId()}:`;
  const out: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(prefix)) out.push(k.slice(prefix.length));
    }
  } catch { /* noop */ }
  return out;
}

/** Export everything this device holds, for the user to back up / move. */
export function vaultExport(): Record<string, unknown> {
  const prefix = `te_vault:${getDeviceId()}:`;
  const data: Record<string, unknown> = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(prefix)) {
        try { data[k.slice(prefix.length)] = JSON.parse(localStorage.getItem(k) || "null"); } catch { /* skip */ }
      }
    }
  } catch { /* noop */ }
  return { deviceId: getDeviceId(), exportedAt: new Date().toISOString(), data };
}
