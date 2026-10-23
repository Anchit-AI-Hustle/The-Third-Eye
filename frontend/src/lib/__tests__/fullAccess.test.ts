import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CAPABILITIES, getPolicy } from "@/lib/consent";
import { grantFullDeviceAccess } from "@/lib/fullAccess";

const getUserMedia = vi.fn(async () => ({ getTracks: () => [{ stop: vi.fn() }] }));

beforeEach(() => {
  localStorage.clear();
  getUserMedia.mockClear();
  Object.defineProperty(navigator, "mediaDevices", { value: { getUserMedia }, configurable: true });
  Object.defineProperty(navigator, "geolocation", { value: { getCurrentPosition: (ok: () => void) => ok() }, configurable: true });
  vi.stubGlobal("Notification", { requestPermission: vi.fn(async () => "granted") });
});
afterEach(() => { vi.unstubAllGlobals(); delete (window as { Capacitor?: unknown }).Capacitor; });

describe("one tap for full device access", () => {
  it("sets every capability to allow-always so the app never asks again", async () => {
    await grantFullDeviceAccess();
    expect(CAPABILITIES.every((c) => getPolicy(c) === "always")).toBe(true);
  });

  it("raises the system prompts for microphone, camera, location and notifications", async () => {
    await grantFullDeviceAccess();
    expect(getUserMedia).toHaveBeenCalledWith({ audio: true });
    expect(getUserMedia).toHaveBeenCalledWith({ video: true });
    expect(Notification.requestPermission).toHaveBeenCalled();
  });

  it("asks the Android app for SMS and calling too", async () => {
    const requestPermissions = vi.fn(async () => ({ sms: "granted", phone: "granted" }));
    (window as { Capacitor?: unknown }).Capacitor = { getPlatform: () => "android", Plugins: { DeviceControl: { requestPermissions } } };
    await grantFullDeviceAccess();
    expect(requestPermissions).toHaveBeenCalledWith({ permissions: ["sms", "phone"] });
  });

  it("keeps going when one prompt is refused and reports each step", async () => {
    getUserMedia.mockRejectedValueOnce(new Error("NotAllowedError"));
    const steps: string[] = [];
    await grantFullDeviceAccess((s) => steps.push(s));
    expect(Notification.requestPermission).toHaveBeenCalled();
    expect(steps.at(-1)).toMatch(/done/i);
  });
});
