"use client";

import Link from "next/link";
import { HeroCanvas } from "./HeroCanvas";
import { Reveal } from "@/components/hud/Reveal";
import { HoloFrame } from "@/components/hud/HoloFrame";

const READOUT = [
  { k: "assistant", v: "online" },
  { k: "workspace", v: "private" },
  { k: "agents", v: "4 ready" },
];

export function LandingHero() {
  return (
    <section className="scene-3d relative flex min-h-[620px] items-center justify-center overflow-hidden text-center">
      <HeroCanvas />

      {/* Readability veil — the copy has to stay crisp over the particles. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-background-base/10 via-background-base/45 to-background-base"
      />

      <Reveal immediate stagger={0.11} className="relative z-10 w-full">
        <div className="mx-auto max-w-2xl px-5 py-24">
          <div
            data-reveal
            className="mb-6 inline-flex items-center gap-2 rounded-full border border-accent-blue/30 bg-accent-blue/10 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.2em] text-accent-blue"
          >
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent-blue" />
            Personal AI OS
          </div>

          <h1
            data-reveal
            className="font-display text-4xl font-bold leading-[1.05] tracking-tight md:text-6xl"
          >
            Your personal
            <br />
            <span className="gradient-text">AI operating system</span>
          </h1>

          <p data-reveal className="mt-6 text-base leading-relaxed text-text-secondary md:text-lg">
            A private workspace where an AI assistant captures your tasks and notes, searches your
            own knowledge, listens and transcribes in real time, and keeps you ahead of everything —
            owned entirely by you.
          </p>

          <div data-reveal className="mt-9 flex items-center justify-center">
            <Link
              href="/auth/signin"
              className="group flex h-12 items-center justify-center gap-2 rounded-input bg-accent-blue px-7 text-sm font-semibold text-background-base shadow-[0_0_30px_rgba(79,195,247,0.35)] transition-all duration-interaction hover:brightness-110 active:scale-[0.98]"
            >
              Get started with Google
              <span className="transition-transform group-hover:translate-x-0.5">→</span>
            </Link>
          </div>

          <p data-reveal className="mt-4 text-xs text-text-muted">
            Private by design — your data stays in your own workspace and is visible only to you.
          </p>

          {/* Instrument readout: gives the hero a floor and states live status
              without inventing metrics we cannot back up. */}
          <HoloFrame
            data-reveal
            rule
            size="sm"
            className="mx-auto mt-12 max-w-md rounded-card border border-border-default/60 bg-background-surface/40 px-6 py-4 backdrop-blur-sm"
          >
            <dl className="flex items-center justify-between gap-4">
              {READOUT.map((r) => (
                <div key={r.k} className="text-left">
                  <dt className="hud-label">{r.k}</dt>
                  <dd className="font-mono text-xs text-text-secondary">{r.v}</dd>
                </div>
              ))}
            </dl>
          </HoloFrame>
        </div>
      </Reveal>
    </section>
  );
}
