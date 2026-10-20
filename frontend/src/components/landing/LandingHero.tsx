"use client";

import Link from "next/link";
import { HeroCanvas } from "./HeroCanvas";
import { Reveal } from "@/components/hud/Reveal";
import { HoloFrame } from "@/components/hud/HoloFrame";

const READOUT = [
  { k: "assistant", v: "online" },
  { k: "workspace", v: "private" },
  { k: "agents", v: "6 ready" },
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
            Your tasks are already in your inbox.
            <br />
            <span className="gradient-text">The Third Eye pulls them out for you.</span>
          </h1>

          <p data-reveal className="mt-6 text-base leading-relaxed text-text-secondary md:text-lg">
            No typing, no re-entry - your Gmail gets scanned automatically and turned into a
            tracked list. Notes you'll never lose, answers pulled straight from your own documents,
            all in one private workspace that remembers and acts for you - not just another list to
            maintain.
          </p>

          <div data-reveal className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/demo"
              className="group flex h-12 w-full items-center justify-center gap-2 rounded-input bg-accent-blue px-7 text-sm font-semibold text-background-base shadow-[0_0_30px_rgba(79,195,247,0.35)] transition-all duration-interaction hover:brightness-110 active:scale-[0.98] sm:w-auto"
            >
              Try the demo
              <span className="transition-transform group-hover:translate-x-0.5">→</span>
            </Link>
            <Link
              href="/auth/signin"
              className="flex h-12 w-full items-center justify-center rounded-input border border-accent-blue/40 px-7 text-sm font-semibold text-accent-blue transition-colors duration-interaction hover:bg-accent-blue/10 sm:w-auto"
            >
              Get started
            </Link>
          </div>

          <p data-reveal className="mt-4 text-xs text-text-muted">
            The demo runs on sample data - no sign-in, nothing saved.{" "}
            <Link href="/privacy" className="underline hover:text-text-secondary">
              What we keep when you sign in
            </Link>
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
