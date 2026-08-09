"use client";

import { useEffect, useLayoutEffect, useRef } from "react";

export type RevealProps = {
  children: React.ReactNode;
  /** Distance in px each item travels on the way in. */
  distance?: number;
  /** Gap between consecutive items in a group. */
  stagger?: number;
  /** Play immediately on mount instead of waiting for the scroll position. */
  immediate?: boolean;
  className?: string;
};

// Scroll-reveals every descendant marked `data-reveal`. GSAP + ScrollTrigger
// are imported lazily so neither reaches the server bundle or the critical
// path.
//
// The subtree is "armed" (hidden via CSS) in a layout effect — before paint —
// rather than in the async GSAP callback, which is what stops the items from
// flashing at full opacity for a frame before the timeline takes over. If the
// GSAP chunk fails to load, or JS never runs at all, the subtree is simply
// never armed and the content renders normally.
export function Reveal({
  children,
  distance = 28,
  stagger = 0.08,
  immediate = false,
  className,
}: RevealProps) {
  const root = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!reduced) root.current?.setAttribute("data-reveal-armed", "true");
  }, []);

  useEffect(() => {
    const el = root.current;
    if (!el) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let ctx: { revert: () => void } | undefined;
    let cancelled = false;

    Promise.all([import("gsap"), import("gsap/ScrollTrigger")])
      .then(([{ gsap }, { ScrollTrigger }]) => {
        if (cancelled) return;
        gsap.registerPlugin(ScrollTrigger);

        ctx = gsap.context(() => {
          const items = gsap.utils.toArray<HTMLElement>("[data-reveal]");
          if (!items.length) return;

          const from = { opacity: 0, y: distance, filter: "blur(6px)" };
          const to = {
            opacity: 1,
            y: 0,
            filter: "blur(0px)",
            duration: 0.75,
            ease: "power3.out",
            stagger,
          };

          if (immediate) {
            gsap.fromTo(items, from, { ...to, delay: 0.1 });
            return;
          }

          // Group items by their offset row so a grid reveals row-by-row
          // instead of every card firing at once.
          const rows = new Map<number, HTMLElement[]>();
          items.forEach((item) => {
            const top = Math.round(item.offsetTop / 24) * 24;
            const row = rows.get(top) ?? [];
            row.push(item);
            rows.set(top, row);
          });

          rows.forEach((row) => {
            gsap.fromTo(row, from, {
              ...to,
              scrollTrigger: {
                trigger: row[0],
                start: "top 88%",
                toggleActions: "play none none none",
              },
            });
          });
        }, el);
      })
      .catch(() => {
        // GSAP never arrived — un-arm so the content is not left invisible.
        el.removeAttribute("data-reveal-armed");
      });

    return () => {
      cancelled = true;
      ctx?.revert();
    };
  }, [distance, stagger, immediate]);

  return (
    <div ref={root} className={className}>
      {children}
    </div>
  );
}
