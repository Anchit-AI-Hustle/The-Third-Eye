// Phone tilt for the 3D cards on touch screens, which have no hover to tilt
// toward. One deviceorientation listener feeds every card, eased per frame.
// iOS asks permission once, on the first tap; Android needs none.

export type Tilt = { x: number; y: number };
type Orientation = { beta: number; gamma: number };

const RANGE = 30; // degrees of phone tilt for a full lean
const clamp = (v: number) => Math.max(-0.5, Math.min(0.5, v));

/** -0.5..0.5 per axis, relative to how the phone was held when tilt started. */
export function tiltFromOrientation(beta: number, gamma: number, base: Orientation): Tilt {
  return { x: clamp((gamma - base.gamma) / RANGE), y: clamp((beta - base.beta) / RANGE) };
}

const listeners = new Set<(t: Tilt) => void>();
let base: Orientation | null = null;
let target: Tilt = { x: 0, y: 0 };
let current: Tilt = { x: 0, y: 0 };
let raf = 0;
let started = false;
const ASKED = "jarvis_tilt_asked";

function onOrientation(e: DeviceOrientationEvent) {
  if (e.beta == null || e.gamma == null) return;
  base ??= { beta: e.beta, gamma: e.gamma };
  target = tiltFromOrientation(e.beta, e.gamma, base);
  if (!raf) raf = requestAnimationFrame(step);
}

function step() {
  current = { x: current.x + (target.x - current.x) * 0.15, y: current.y + (target.y - current.y) * 0.15 };
  listeners.forEach((l) => l(current));
  const moving = Math.abs(target.x - current.x) + Math.abs(target.y - current.y) > 0.002;
  raf = moving ? requestAnimationFrame(step) : 0;
}

function start() {
  if (started) return;
  started = true;
  const Req = (window.DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> }) ?? {};
  const listen = () => window.addEventListener("deviceorientation", onOrientation);
  if (typeof Req.requestPermission !== "function") return listen();
  let asked = false;
  try { asked = localStorage.getItem(ASKED) === "1"; } catch { /* private mode */ }
  // Granted earlier: a call outside a gesture resolves without a prompt.
  const ask = () => Req.requestPermission!().then((s) => { if (s === "granted") listen(); }).catch(() => {});
  if (asked) { void ask(); return; }
  window.addEventListener("pointerdown", () => {
    try { localStorage.setItem(ASKED, "1"); } catch { /* private mode */ }
    void ask();
  }, { once: true });
}

export function subscribeTilt(fn: (t: Tilt) => void): () => void {
  start();
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
