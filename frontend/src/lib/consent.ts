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
  window.dispatchEvent(new CustomEvent("te:consent", { detail: { key, state } }));
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
  (CAPABILITIES).forEach(clearPolicy);
}

// ─── Per-capability permission policy ("always" vs "ask each time") ───────────
//
// The OS/browser owns the real permission prompt and its own "allow once /
// allow every time" choice — an app cannot override that. This layer adds the
// app's own memory on top: for each capability the user can choose to allow it
// *every time* (we never re-ask; the feature runs straight away) or *just this
// once* (we ask again next time). Anything not set to "always" is re-requested
// on every use, which is the behaviour we want when permission wasn't granted.

export type PermissionCapability = "microphone" | "camera" | "screen" | "location" | "notifications";
export type PermissionPolicy = "always" | "ask";

export const CAPABILITIES: PermissionCapability[] = [
  "microphone", "camera", "screen", "location", "notifications",
];

const LS_POLICY = "te_perm_policy_";
export const PERM_POLICY_EVENT = "te:perm-policy";

export function getPolicy(cap: PermissionCapability): PermissionPolicy {
  if (typeof window === "undefined") return "ask";
  return localStorage.getItem(LS_POLICY + cap) === "always" ? "always" : "ask";
}

export function setPolicy(cap: PermissionCapability, policy: PermissionPolicy) {
  if (typeof window === "undefined") return;
  if (policy === "always") localStorage.setItem(LS_POLICY + cap, "always");
  else localStorage.removeItem(LS_POLICY + cap);
  window.dispatchEvent(new CustomEvent(PERM_POLICY_EVENT, { detail: { cap, policy } }));
}

export function clearPolicy(cap: PermissionCapability) {
  setPolicy(cap, "ask");
}

export function allPolicies(): Record<PermissionCapability, PermissionPolicy> {
  return CAPABILITIES.reduce((acc, c) => { acc[c] = getPolicy(c); return acc; },
    {} as Record<PermissionCapability, PermissionPolicy>);
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
    } else if (key === "microphone" || key === "camera") {
      // We deliberately DO NOT acquire a stream here. iOS Safari and several
      // Android Chrome builds count every getUserMedia() invocation as a fresh
      // permission prompt — eager-probing here and then opening the mic again
      // from useVoice.ts produces two prompts back-to-back. Instead we mark
      // this consent as "user agreed in dialog" and let the actual feature
      // (useVoice / camera capture) trigger the single real prompt at the
      // moment it needs the stream.
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
