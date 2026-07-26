import { useEffect, useRef, useCallback } from "react";

const FOCUSABLE = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function useFocusTrap(active: boolean) {
  const containerRef = useRef<HTMLDivElement>(null);
  const previousRef = useRef<HTMLElement | null>(null);

  const trap = useCallback((e: KeyboardEvent) => {
    if (e.key !== "Tab" || !containerRef.current) return;
    const focusable = Array.from(containerRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (focusable.length === 0) { e.preventDefault(); return; }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey) {
      if (document.activeElement === first) { e.preventDefault(); last.focus(); }
    } else {
      if (document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }, []);

  useEffect(() => {
    if (!active) return;
    previousRef.current = document.activeElement as HTMLElement;
    const el = containerRef.current;
    if (el) {
      const first = el.querySelector<HTMLElement>(FOCUSABLE);
      if (first) {
        requestAnimationFrame(() => first.focus());
      } else {
        el.tabIndex = -1;
        requestAnimationFrame(() => el.focus());
      }
    }
    document.addEventListener("keydown", trap);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", trap);
      document.body.style.overflow = "";
      previousRef.current?.focus();
    };
  }, [active, trap]);

  return containerRef;
}
