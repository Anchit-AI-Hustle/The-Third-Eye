"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";

// The account's data changes on other devices too: the phone files Life Log
// chunks, the laptop adds a task, the server's autopilot updates a goal. Every
// list re-reads on this tick - every 20 s while the app is on screen, and at
// once when it comes back into view or online - so each device stays current.

export const LIVE_SYNC = "te:live-sync";
const EVERY_MS = 20_000;
const MIN_GAP_MS = 5_000;

/** A number that goes up on every live-sync tick; add it to a loader's dependencies. */
export function useLiveTick(): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    const on = () => setN((x) => x + 1);
    window.addEventListener(LIVE_SYNC, on);
    return () => window.removeEventListener(LIVE_SYNC, on);
  }, []);
  return n;
}

export function LiveSync() {
  const { status } = useSession();
  useEffect(() => {
    if (status !== "authenticated") return;
    let last = Date.now();
    const fire = () => {
      if (document.visibilityState !== "visible" || Date.now() - last < MIN_GAP_MS) return;
      last = Date.now();
      window.dispatchEvent(new Event(LIVE_SYNC));
    };
    const every = setInterval(fire, EVERY_MS);
    document.addEventListener("visibilitychange", fire);
    window.addEventListener("focus", fire);
    window.addEventListener("online", fire);
    return () => {
      clearInterval(every);
      document.removeEventListener("visibilitychange", fire);
      window.removeEventListener("focus", fire);
      window.removeEventListener("online", fire);
    };
  }, [status]);
  return null;
}
