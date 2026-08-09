"use client";

// Gather what the browser will tell us about the device — so the assistant can
// answer "how much storage is left", "how's my battery/network" etc. from real
// data instead of refusing. All standard, permission-free web APIs; every probe
// is best-effort and guarded so a missing API never throws.

export type DeviceInfo = Record<string, unknown>;

export async function getDeviceInfo(): Promise<DeviceInfo> {
  if (typeof navigator === "undefined") return {};
  const nav = navigator as any;
  const info: DeviceInfo = {};

  try {
    info.platform = nav.userAgentData?.platform || navigator.platform || "unknown";
    info.online = navigator.onLine;
    info.language = navigator.language;
    if (nav.deviceMemory) info.deviceMemoryGB = nav.deviceMemory;
    if (navigator.hardwareConcurrency) info.cpuCores = navigator.hardwareConcurrency;
    if (typeof screen !== "undefined") {
      info.screen = `${screen.width}×${screen.height}`;
      info.pixelRatio = typeof window !== "undefined" ? window.devicePixelRatio : 1;
    }

    const c = nav.connection;
    if (c) info.network = { type: c.effectiveType, downlinkMbps: c.downlink, saveData: !!c.saveData };

    if (navigator.storage?.estimate) {
      const est = await navigator.storage.estimate();
      const usage = est.usage ?? 0;
      const quota = est.quota ?? 0;
      info.storage = {
        usedMB: Math.round(usage / 1e6),
        quotaMB: Math.round(quota / 1e6),
        freeMB: Math.round((quota - usage) / 1e6),
        usedPercent: quota ? Math.round((usage / quota) * 100) : null,
      };
    }

    if (typeof nav.getBattery === "function") {
      try {
        const b = await nav.getBattery();
        info.battery = { levelPercent: Math.round(b.level * 100), charging: b.charging };
      } catch { /* not available */ }
    }
  } catch { /* best-effort — return whatever we gathered */ }

  return info;
}
