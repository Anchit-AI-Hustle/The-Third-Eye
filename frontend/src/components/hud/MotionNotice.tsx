"use client";

import { useEffect, useState } from "react";
import { applyMotionPref, deviceReducesMotion, motionPref, setMotionPref } from "@/lib/motion";

const SEEN = "jarvis_motion_notice";

// A phone with Reduce Motion on shows none of the animations. Say so once and
// offer to turn them on, instead of the app silently looking static.
export function MotionNotice() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    applyMotionPref();
    let seen = false;
    try { seen = localStorage.getItem(SEEN) === "1"; } catch { /* private mode */ }
    setShow(!seen && motionPref() === "device" && deviceReducesMotion());
  }, []);
  if (!show) return null;
  const close = (full: boolean) => {
    if (full) setMotionPref("full");
    try { localStorage.setItem(SEEN, "1"); } catch { /* private mode */ }
    setShow(false);
  };
  return (
    <div role="status" className="fixed z-[70] left-1/2 -translate-x-1/2 bottom-[calc(5.5rem_+_env(safe-area-inset-bottom))] w-[min(92vw,420px)] rounded-card border border-accent-blue/40 bg-background-surface/95 backdrop-blur p-4 shadow-lg">
      <p className="text-sm text-text-primary">Your device has Reduce Motion on, so JARVIS&apos;s animations and 3D effects are paused.</p>
      <div className="mt-3 flex gap-2 justify-end">
        <button type="button" onClick={() => close(false)} className="px-3 py-1.5 rounded-input text-xs text-text-secondary border border-border-default">Keep them off</button>
        <button type="button" onClick={() => close(true)} className="px-3 py-1.5 rounded-input text-xs font-medium bg-accent-blue text-black">Turn animations on</button>
      </div>
    </div>
  );
}
