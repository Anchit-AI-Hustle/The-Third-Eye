import { CAPABILITIES, setPolicy } from "@/lib/consent";

// "Allow full device access": every capability is set to allow-always in the
// app's own policy layer, then each OS prompt the platform has is raised in
// turn. The OS keeps the final say; a refused prompt is skipped, not retried.

type NativePlugin = { requestPermissions(o: { permissions: string[] }): Promise<unknown> };

async function stopAfter(constraints: MediaStreamConstraints) {
  const stream = await navigator.mediaDevices.getUserMedia(constraints);
  stream.getTracks().forEach((t) => t.stop());
}

export async function grantFullDeviceAccess(onStep: (step: string) => void = () => {}): Promise<void> {
  CAPABILITIES.forEach((c) => setPolicy(c, "always"));

  const steps: [string, () => Promise<unknown>][] = [
    ["Microphone", () => stopAfter({ audio: true })],
    ["Camera", () => stopAfter({ video: true })],
    ["Location", () => new Promise<void>((done) => navigator.geolocation.getCurrentPosition(() => done(), () => done(), { timeout: 8000 }))],
    ["Notifications", () => Notification.requestPermission()],
    ["Motion", async () => {
      const M = (window as { DeviceMotionEvent?: { requestPermission?: () => Promise<string> } }).DeviceMotionEvent;
      await M?.requestPermission?.();
    }],
    ["Storage", () => navigator.storage?.persist?.() ?? Promise.resolve()],
    ["SMS and calls", async () => {
      const cap = (window as { Capacitor?: { getPlatform?: () => string; Plugins?: { DeviceControl?: NativePlugin } } }).Capacitor;
      if (cap?.getPlatform?.() === "android") await cap.Plugins?.DeviceControl?.requestPermissions({ permissions: ["sms", "phone"] });
    }],
  ];
  for (const [i, [name, ask]] of steps.entries()) {
    onStep(`${i + 1}/${steps.length}: ${name}`);
    try { await ask(); } catch { /* refused or unsupported here: keep going */ }
  }
  onStep("Done. Anything you allowed stays allowed on this device.");
}
