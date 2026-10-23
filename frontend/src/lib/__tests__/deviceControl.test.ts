import { afterEach, describe, expect, it, vi } from "vitest";
import { executeDeviceAction } from "@/lib/deviceControl";

const calls: { method: string; args: unknown }[] = [];
function nativeApp(plugin: Record<string, (a: unknown) => Promise<unknown>> = {}) {
  (window as any).Capacitor = {
    isNativePlatform: () => true,
    Plugins: { DeviceControl: new Proxy(plugin, { get: (t, m: string) => t[m] ?? (async (a: unknown) => { calls.push({ method: m, args: a }); return { ok: true }; }) }) },
  };
}
afterEach(() => { delete (window as any).Capacitor; calls.length = 0; vi.restoreAllMocks(); });

describe("device control tells the truth", () => {
  it("mute sets the phone volume to 0, not 50", async () => {
    nativeApp();
    const r = await executeDeviceAction({ action: "mute", device: "phone", value: null });
    expect(calls).toContainEqual({ method: "setVolume", args: { level: 0 } });
    expect(r.ok).toBe(true);
  });

  it("volume 0 is zero", async () => {
    nativeApp();
    await executeDeviceAction({ action: "volume", device: "phone", value: "0" });
    expect(calls).toContainEqual({ method: "setVolume", args: { level: 0 } });
  });

  it("does not claim to switch Wi-Fi from a web page", async () => {
    const r = await executeDeviceAction({ action: "wifi_off", device: "phone", value: null });
    expect(r.ok).toBe(false);
    expect(r.applied).toMatch(/can't be switched from here/);
  });

  it("does not claim settings opened when the app has no way to open them", async () => {
    (window as any).Capacitor = { isNativePlatform: () => true, Plugins: {} };
    expect((await executeDeviceAction({ action: "bluetooth_on", device: "phone", value: null })).ok).toBe(false);
  });

  it("toggling a native torch that is on turns it off", async () => {
    nativeApp();
    await executeDeviceAction({ action: "on", device: "flashlight", value: null });
    await executeDeviceAction({ action: "toggle", device: "flashlight", value: null });
    expect(calls.filter((c) => c.method === "flashlight").map((c) => c.args)).toEqual([{ on: true }, { on: false }]);
  });
});
