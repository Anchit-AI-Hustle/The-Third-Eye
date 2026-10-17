import { afterEach, describe, expect, it, vi } from "vitest";
import { deviceSendable, sendFromDevice } from "@/lib/nativeOutreach";

const sms = { action: "sms", url: "sms:+919811122334?body=Running%2010%20min%20late", message: "Running 10 min late" };
const call = { action: "call", url: "tel:+919811122334" };

function android(plugin: Record<string, unknown>) {
  vi.stubGlobal("Capacitor", { getPlatform: () => "android", Plugins: { DeviceControl: plugin } });
}
afterEach(() => vi.unstubAllGlobals());

describe("sendFromDevice", () => {
  it("sends the SMS over the phone's own network in the Android app", async () => {
    const sendSms = vi.fn().mockResolvedValue({ ok: true });
    android({ sendSms, call: vi.fn() });
    expect(await sendFromDevice(sms)).toEqual({ ok: true, text: "SMS sent from your phone to +919811122334." });
    expect(sendSms).toHaveBeenCalledWith({ to: "+919811122334", message: "Running 10 min late" });
  });

  it("places the call directly in the Android app", async () => {
    const callFn = vi.fn().mockResolvedValue({ ok: true });
    android({ sendSms: vi.fn(), call: callFn });
    expect(await sendFromDevice(call)).toEqual({ ok: true, text: "Calling +919811122334 from your phone." });
    expect(callFn).toHaveBeenCalledWith({ number: "+919811122334" });
  });

  it("reports a failure instead of claiming it went", async () => {
    android({ sendSms: vi.fn().mockResolvedValue({ ok: false, error: "No service" }), call: vi.fn() });
    expect(await sendFromDevice(sms)).toEqual({ ok: false, text: "The SMS to +919811122334 was not sent: No service." });
  });

  it("leaves it to the browser (open Messages) outside the Android app", async () => {
    expect(await sendFromDevice(sms)).toBeNull();
    vi.stubGlobal("Capacitor", { getPlatform: () => "ios", Plugins: {} });
    expect(await sendFromDevice(sms)).toBeNull();
  });

  it("does not handle WhatsApp or links without a number", async () => {
    android({ sendSms: vi.fn(), call: vi.fn() });
    expect(await sendFromDevice({ action: "whatsapp", url: "whatsapp://send?phone=91981" })).toBeNull();
    expect(await sendFromDevice({ action: "sms", url: "sms:?body=hi" })).toBeNull();
  });

  it("deviceSendable is true only where the phone can send it itself", () => {
    expect(deviceSendable(sms)).toBe(false);
    android({ sendSms: vi.fn(), call: vi.fn() });
    expect(deviceSendable(sms)).toBe(true);
    expect(deviceSendable(call)).toBe(true);
    expect(deviceSendable({ action: "whatsapp", url: "whatsapp://send?phone=919811122334" })).toBe(false);
  });
});
