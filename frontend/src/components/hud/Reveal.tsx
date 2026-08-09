"use client";

import { useEffect, useLayoutEffect, useRef } from "react";

import { useReducedMotion } from "@/hooks/useReducedMotion";

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
  // Read reactively rather than once at mount: someone switching reduced
  // motion on mid-page is usually doing it *because* something is moving, so
  // the setting has to take effect on the animation already running. Both
  // effects below key off this, and their cleanups (un-arm, ctx.revert) strip
  // GSAP's inline opacity/transform/blur back off — otherwise unrevealed items
  // keep those styles, outrank the reduced-motion CSS, and still animate in.
  const reduced = useReducedMotion();

  useLayoutEffect(() => {
    if (reduced) {
      root.current?.removeAttribute("data-reveal-armed");
      return;
    }
    root.current?.setAttribute("data-reveal-armed", "true");
  }, [reduced]);

  useEffect(() => {
    const el = root.current;
    if (!el) return;

    if (reduced) return;

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
            // Animating `y` writes an inline `transform`, which outranks the
            // stylesheet rule. On a Card3D that rule is the tilt itself
            // — transform: perspective() rotateX(var(--rx))… — so the inline
            // value left behind at the end of the tween would freeze every
            // revealed card flat: the pointer handler keeps updating --rx/--ry
            // and nothing moves. Handing transform back to the stylesheet on
            // completion keeps the reveal and the tilt from fighting over the
            // same property.
            clearProps: "transform",
          };

          if (immediate) {
            gsap.fromTo(items, from, { ...to, delay: 0.1 });
            return;
          }

          // Group items by their row so a grid reveals row-by-row instead of
          // every card firing at once.
          //
          // Position has to be document-relative. `offsetTop` is measured
          // from each element's own offsetParent, and a single <Reveal> wraps
          // several sections whose items sit inside different positioned
          // ancestors (.card-3d and .holo-frame are both `position:
          // relative`). Those values are not comparable: items from unrelated
          // sections report near-identical offsets, collapse into one row,
          // and inherit a trigger from whichever element happens to be first
          // — revealing later sections long before they are scrolled to.
          const scrollY = window.scrollY;
          const rows = new Map<number, HTMLElement[]>();
          items.forEach((item) => {
            const top = Math.round((item.getBoundingClientRect().top + scrollY) / 24) * 24;
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
  }, [distance, stagger, immediate, reduced]);

  return (
    <div ref={root} className={className}>
      {children}
    </div>
  );
}
