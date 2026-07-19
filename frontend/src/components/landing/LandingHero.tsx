"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { HeroCanvas } from "./HeroCanvas";

// The landing hero: a Three.js particle "eye" backdrop with a GSAP entrance
// timeline that choreographs the eyebrow → headline → subcopy → CTA reveal.
export function LandingHero() {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let ctx: { revert: () => void } | undefined;
    import("gsap").then(({ gsap }) => {
      if (!root.current) return;
      const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      ctx = gsap.context(() => {
        const items = gsap.utils.toArray<HTMLElement>("[data-hero]");
        if (reduce) { gsap.set(items, { opacity: 1, y: 0 }); return; }
        gsap.fromTo(
          items,
          { opacity: 0, y: 26, filter: "blur(6px)" },
          { opacity: 1, y: 0, filter: "blur(0px)", duration: 0.9, ease: "power3.out", stagger: 0.13, delay: 0.15 },
        );
      }, root);
    });
    return () => ctx?.revert();
  }, []);

  return (
    <section ref={root} className="relative min-h-[560px] flex items-center justify-center text-center overflow-hidden">
      <HeroCanvas />
      {/* readability veil so the copy stays crisp over the particles */}
      <div className="absolute inset-0 -z-0 bg-gradient-to-b from-background-base/10 via-background-base/40 to-background-base pointer-events-none" />

      <div className="relative z-10 max-w-2xl mx-auto px-5 py-24">
        <div data-hero className="inline-flex items-center gap-2 rounded-full border border-[#4FC3F7]/30 bg-[#4FC3F7]/10 px-3 py-1 text-[11px] font-mono uppercase tracking-[0.2em] text-[#4FC3F7] mb-6">
          <span className="w-1.5 h-1.5 rounded-full bg-[#4FC3F7] animate-pulse" /> Personal AI OS
        </div>
        <h1 data-hero className="font-display text-4xl md:text-6xl font-bold tracking-tight leading-[1.05]">
          Your personal
          <br />
          <span className="bg-gradient-to-r from-[#4FC3F7] via-[#7B5CF0] to-[#4FC3F7] bg-clip-text text-transparent">
            AI operating system
          </span>
        </h1>
        <p data-hero className="text-text-secondary text-base md:text-lg mt-6 leading-relaxed">
          A private workspace where an AI assistant captures your tasks and notes, searches your own
          knowledge, listens and transcribes in real time, and keeps you ahead of everything — owned
          entirely by you.
        </p>
        <div data-hero className="mt-9 flex items-center justify-center gap-3">
          <Link
            href="/auth/signin"
            className="group flex items-center justify-center gap-2 bg-[#4FC3F7] text-[#07070F] rounded-input px-7 h-12 text-sm font-semibold transition-all duration-150 hover:brightness-110 active:scale-[0.98] shadow-[0_0_30px_rgba(79,195,247,0.35)]"
          >
            Get started with Google
            <span className="transition-transform group-hover:translate-x-0.5">→</span>
          </Link>
        </div>
        <p data-hero className="text-text-muted text-xs mt-4">
          Private by design — your data stays in your own workspace and is visible only to you.
        </p>
      </div>
    </section>
  );
}
