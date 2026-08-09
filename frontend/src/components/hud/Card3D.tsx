"use client";

import { useCallback, useRef } from "react";
import { cn } from "@/lib/utils";
import { useReducedMotion } from "@/hooks/useReducedMotion";

export type Card3DProps = {
  children: React.ReactNode;
  /** Max tilt in degrees at the panel's edge. */
  intensity?: number;
  /** translateZ applied while the pointer is over the panel. */
  lift?: number;
  /** Specular sweep that tracks the pointer. */
  glare?: boolean;
  className?: string;
} & Omit<React.HTMLAttributes<HTMLDivElement>, "children">;

// A panel that tilts toward the pointer in real 3D. Children marked
// `.depth-1/2/3` separate from the surface as it tilts, which is what sells
// the depth — a flat tilt on its own just looks like a skew.
//
// Writes CSS custom properties directly on the node rather than going through
// React state: pointermove fires at screen refresh rate, and re-rendering a
// subtree per frame would drop frames on mid-range hardware. Updates are
// batched into a single rAF so a burst of events costs one style write.
export function Card3D({
  children,
  intensity = 7,
  lift = 12,
  glare = true,
  className,
  ...rest
}: Card3DProps) {
  const ref = useRef<HTMLDivElement>(null);
  const frame = useRef(0);
  const pending = useRef<{ x: number; y: number } | null>(null);
  const reduced = useReducedMotion();

  const flush = useCallback(() => {
    frame.current = 0;
    const el = ref.current;
    const p = pending.current;
    if (!el || !p) return;

    const rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    // -0.5 … 0.5 from the panel's centre.
    const nx = (p.x - rect.left) / rect.width - 0.5;
    const ny = (p.y - rect.top) / rect.height - 0.5;

    // Y-axis rotation follows horizontal travel; X-axis is inverted so the
    // panel leans *toward* the pointer rather than away from it.
    el.style.setProperty("--ry", `${nx * intensity * 2}deg`);
    el.style.setProperty("--rx", `${-ny * intensity * 2}deg`);
    el.style.setProperty("--lift", `${lift}px`);

    if (glare) {
      el.style.setProperty("--gx", `${(nx + 0.5) * 100}%`);
      el.style.setProperty("--gy", `${(ny + 0.5) * 100}%`);
      el.style.setProperty("--glare", "1");
    }
  }, [intensity, lift, glare]);

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      // Coarse pointers have no hover state — a "tilt" would only fire on tap
      // and read as a glitch.
      if (reduced || e.pointerType === "touch") return;
      pending.current = { x: e.clientX, y: e.clientY };
      ref.current?.setAttribute("data-tracking", "true");
      if (!frame.current) frame.current = requestAnimationFrame(flush);
    },
    [reduced, flush],
  );

  const reset = useCallback(() => {
    if (frame.current) {
      cancelAnimationFrame(frame.current);
      frame.current = 0;
    }
    pending.current = null;
    const el = ref.current;
    if (!el) return;
    el.removeAttribute("data-tracking");
    el.style.setProperty("--rx", "0deg");
    el.style.setProperty("--ry", "0deg");
    el.style.setProperty("--lift", "0px");
    el.style.setProperty("--glare", "0");
  }, []);

  return (
    <div
      ref={ref}
      className={cn("card-3d", className)}
      onPointerMove={onPointerMove}
      onPointerLeave={reset}
      onPointerCancel={reset}
      onBlur={reset}
      {...rest}
    >
      {children}
    </div>
  );
}
