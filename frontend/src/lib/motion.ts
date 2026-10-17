// Animations follow the device's Reduce Motion setting unless the user turns
// them on in Settings. "Full" marks <html data-motion-full>, which the reduced
// motion CSS in globals.css skips, and reducedMotion() reports false.

export const MOTION_KEY = "jarvis_motion";
export const MOTION_EVENT = "jarvis:motion";
export type MotionPref = "device" | "full";

export function motionPref(): MotionPref {
  try { return localStorage.getItem(MOTION_KEY) === "full" ? "full" : "device"; } catch { return "device"; }
}

export function deviceReducesMotion(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

export function reducedMotion(): boolean {
  return motionPref() !== "full" && deviceReducesMotion();
}

export function applyMotionPref(): void {
  document.documentElement.toggleAttribute("data-motion-full", motionPref() === "full");
}

export function setMotionPref(pref: MotionPref): void {
  try { localStorage.setItem(MOTION_KEY, pref); } catch { /* private mode: this visit only */ }
  applyMotionPref();
  window.dispatchEvent(new Event(MOTION_EVENT));
}
