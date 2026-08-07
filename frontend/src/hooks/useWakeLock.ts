"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";

// Holds a Screen Wake Lock so the device screen does not sleep while the
// assistant is armed. This is the closest a web app can get to "keep
// listening in the background": a locked/slept screen is what suspends
// SpeechRecognition and getUserMedia on mobile, so keeping the screen on
// keeps the mic alive for a phone sitting on a desk mid-conversation.
//
// The platform auto-releases the lock whenever the page is hidden, so we
// re-acquire on visibilitychange while still desired.
export function useWakeLock() {
  const sentinelRef = useRef<any>(null);
  const wantedRef = useRef(false);

  const supported = typeof navigator !== "undefined" && "wakeLock" in navigator;

  const request = useCallback(async () => {
    if (!supported || sentinelRef.current) return;
    try {
      const sentinel = await (navigator as any).wakeLock.request("screen");
      sentinelRef.current = sentinel;
      // If the OS drops it (hidden tab, low battery), clear our handle so
      // the visibility handler knows to re-acquire.
      sentinel.addEventListener?.("release", () => {
        if (sentinelRef.current === sentinel) sentinelRef.current = null;
      });
    } catch {
      /* NotAllowedError when hidden/low-power — retried on next visibility */
    }
  }, [supported]);

  const acquire = useCallback(() => {
    wantedRef.current = true;
    void request();
  }, [request]);

  const release = useCallback(() => {
    wantedRef.current = false;
    const s = sentinelRef.current;
    sentinelRef.current = null;
    try { s?.release?.(); } catch { /* noop */ }
  }, []);

  useEffect(() => {
    if (!supported) return;
    const onVisible = () => {
      if (document.visibilityState === "visible" && wantedRef.current) void request();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [supported, request]);

  // Stable identity so consumers can list this in effect/callback deps
  // without re-running every render (acquire/release are already stable).
  return useMemo(() => ({ acquire, release, supported }), [acquire, release, supported]);
}
