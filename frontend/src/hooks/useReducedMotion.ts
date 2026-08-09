"use client";

import { useEffect, useState } from "react";

// Tracks prefers-reduced-motion and keeps tracking it — the OS setting can be
// toggled while the page is open, and a one-shot read at mount would strand
// the UI in whichever mode it happened to start in.
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return reduced;
}
