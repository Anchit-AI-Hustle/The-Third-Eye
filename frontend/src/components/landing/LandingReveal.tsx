"use client";

import { useEffect, useRef } from "react";

// Wraps landing sections and scroll-reveals any descendant marked `data-reveal`
// as it enters the viewport (GSAP + ScrollTrigger, lazy-imported). Honors
// prefers-reduced-motion and cleans up its triggers on unmount.
export function LandingReveal({ children }: { children: React.ReactNode }) {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let ctx: { revert: () => void } | undefined;
    let cancelled = false;
    Promise.all([import("gsap"), import("gsap/ScrollTrigger")]).then(([{ gsap }, mod]) => {
      if (cancelled || !root.current) return;
      const ScrollTrigger = mod.ScrollTrigger;
      gsap.registerPlugin(ScrollTrigger);
      const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      ctx = gsap.context(() => {
        const items = gsap.utils.toArray<HTMLElement>("[data-reveal]");
        items.forEach((el) => {
          if (reduce) { gsap.set(el, { opacity: 1, y: 0 }); return; }
          gsap.fromTo(
            el,
            { opacity: 0, y: 28 },
            {
              opacity: 1, y: 0, duration: 0.7, ease: "power3.out",
              scrollTrigger: { trigger: el, start: "top 85%", toggleActions: "play none none none" },
            },
          );
        });
      }, root);
    });
    return () => { cancelled = true; ctx?.revert(); };
  }, []);

  return <div ref={root}>{children}</div>;
}
