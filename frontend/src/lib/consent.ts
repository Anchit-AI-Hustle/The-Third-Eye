"use client";

export type ConsentKey = "microphone" | "camera" | "location" | "notifications";
export type ConsentState = "granted" | "denied" | "prompt";

const LS_PREFIX = "te_consent_";
const LS_BUNDLE_ASKED = "te_consent_bundle_asked_v1";

function read(key: ConsentKey): ConsentState {
  if (typeof window === "undefined") return "prompt";
  const v = localStorage.getItem(LS_PREFIX + key);
  return v === "granted" || v === "denied" ? v : "prompt";
}

function write(key: ConsentKey, state: ConsentState) {
  if (typeof window === "undefined") return;
  localStorage.setItem(LS_PREFIX + key, state);
}

export function getConsent(key: ConsentKey): ConsentState {
  return read(key);
}

export function hasBeenAsked(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(LS_BUNDLE_ASKED) === "1";
}

export function markBundleAsked() {
  if (typeof window === "undefined") return;
  localStorage.setItem(LS_BUNDLE_ASKED, "1");
}

export function resetConsents() {
  if (typeof window === "undefined") return;
  (["microphone", "camera", "location", "notifications"] as ConsentKey[]).forEach((k) =>
    localStorage.removeItem(LS_PREFIX + k),
  );
  localStorage.removeItem(LS_BUNDLE_ASKED);
}

async function probeBrowserState(key: ConsentKey): Promise<ConsentState | null> {
  if (typeof navigator === "undefined") return null;

  if (key === "notifications") {
    if (typeof Notification === "undefined") return "denied";
    if (Notification.permission === "granted") return "granted";
    if (Notification.permission === "denied") return "denied";
    return "prompt";
  }

  if (!navigator.permissions?.query) return null;

  const name =
    key === "microphone" ? "microphone" :
    key === "camera" ? "camera" :
    key === "location" ? "geolocation" : null;
  if (!name) return null;

  try {
    const status = await navigator.permissions.query({ name: name as PermissionName });
    if (status.state === "granted") return "granted";
    if (status.state === "denied") return "denied";
    return "prompt";
  } catch {
    return null;
  }
}

export async function requestConsent(key: ConsentKey): Promise<ConsentState> {
  const cached = read(key);

  const browserState = await probeBrowserState(key);
  if (browserState === "granted") {
    write(key, "granted");
    return "granted";
  }
  if (browserState === "denied") {
    write(key, "denied");
    return "denied";
  }
  if (cached === "denied" && browserState !== "prompt") {
    return "denied";
  }

  let state: ConsentState = "denied";

  try {
    if (key === "notifications") {
      const result = await Notification.requestPermission();
      state = result === "granted" ? "granted" : result === "denied" ? "denied" : "prompt";
    } else if (key === "microphone") {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      state = "granted";
    } else if (key === "camera") {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      stream.getTracks().forEach((t) => t.stop());
      state = "granted";
    } else if (key === "location") {
      state = await new Promise<ConsentState>((resolve) => {
        navigator.geolocation.getCurrentPosition(
          () => resolve("granted"),
          (err) => resolve(err.code === err.PERMISSION_DENIED ? "denied" : "prompt"),
          { timeout: 8000, maximumAge: 60_000 },
        );
      });
    }
  } catch {
    state = "denied";
  }

  write(key, state);
  return state;
}

export async function requestConsentBundle(keys: ConsentKey[]): Promise<Record<ConsentKey, ConsentState>> {
  const result = {} as Record<ConsentKey, ConsentState>;
  for (const key of keys) {
    result[key] = await requestConsent(key);
  }
  markBundleAsked();
  return result;
}

export async function getCurrentLocation(): Promise<{ latitude: number; longitude: number } | null> {
  const state = await requestConsent("location");
  if (state !== "granted") return null;
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      () => resolve(null),
      { timeout: 8000, maximumAge: 300_000 },
    );
  });
}
