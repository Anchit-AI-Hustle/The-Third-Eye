import { afterEach, describe, expect, it, vi } from "vitest";
import { executeDeviceAction, parseClock, parseDuration } from "@/lib/deviceControl";

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

describe("Android-app device actions", () => {
  it("reads alarm times and timer lengths the way people say them", () => {
    expect(parseClock("7:30 am")).toEqual({ hour: 7, minute: 30, label: undefined });
    expect(parseClock("6 pm gym")).toEqual({ hour: 18, minute: 0, label: "gym" });
    expect(parseClock("12 am")).toMatchObject({ hour: 0 });
    expect(parseClock("25:00")).toBeNull();
    expect(parseDuration("10 min")).toBe(600);
    expect(parseDuration("1h 30m")).toBe(5400);
    expect(parseDuration("90")).toBe(90);
    expect(parseDuration("soon")).toBeNull();
  });

  it("opens the app the person named, and says when a browser can't", async () => {
    const openApp = vi.fn().mockResolvedValue({ ok: true, applied: "Opened Spotify" });
    vi.stubGlobal("Capacitor", { isNativePlatform: () => true, Plugins: { DeviceControl: { openApp } } });
    expect(await executeDeviceAction({ action: "open", device: "app", value: "spotify" })).toMatchObject({ ok: true, via: "native", applied: "Opened Spotify" });
    expect(openApp).toHaveBeenCalledWith({ name: "spotify" });
    vi.unstubAllGlobals();
    expect(await executeDeviceAction({ action: "open", device: "app", value: "spotify" })).toMatchObject({ ok: false, via: "none" });
  });

  it("asks for the permission instead of claiming it worked", async () => {
    vi.stubGlobal("Capacitor", { isNativePlatform: () => true, Plugins: { DeviceControl: { systemAction: vi.fn().mockResolvedValue({ ok: false, needsPermission: "accessibility" }) } } });
    const r = await executeDeviceAction({ action: "screen_lock", device: "screen_lock", value: null });
    expect(r.ok).toBe(false);
    expect(r.applied).toContain("Accessibility");
    vi.unstubAllGlobals();
  });
});
