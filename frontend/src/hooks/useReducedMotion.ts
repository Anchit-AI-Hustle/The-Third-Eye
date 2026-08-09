"use client";

import { useEffect, useState } from "react";

// Tracks prefers-reduced-motion and keeps tracking it — the OS setting can be
// toggled while the page is open, and a one-shot read at mount would strand
// the UI in whichever mode it happened to start in.
// Subscribes to a MediaQueryList and returns its unsubscribe function.
//
// Safari below 14 — inside Next 14's default browserslist, which this project
// does not narrow — implements only the deprecated addListener/removeListener
// pair. Calling addEventListener there throws, so the cost of assuming the
// modern API is not "no live updates" but every consumer of this hook
// crashing on mount and taking the page down to its error boundary.
export function onMediaChange(
  mq: MediaQueryList,
  handler: (e: MediaQueryListEvent) => void,
): () => void {
  if (typeof mq.addEventListener === "function") {
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }
  mq.addListener(handler);
  return () => mq.removeListener(handler);
}

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    return onMediaChange(mq, (e) => setReduced(e.matches));
  }, []);

  return reduced;
}
