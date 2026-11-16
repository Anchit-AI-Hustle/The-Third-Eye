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
            className="font-display text-3xl font-bold leading-[1.08] tracking-tight sm:text-4xl md:text-6xl"
          >
            Your tasks live in your inbox.
            <br />
            <span className="gradient-text">We pull them out.</span>
          </h1>

          <p data-reveal className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-text-secondary md:text-lg">
            One private AI workspace that turns mail into tracked tasks, searches your documents
            with citations, and acts across web, iPhone, and Android.
          </p>

          <div data-reveal className="mt-9 flex flex-col items-center justify-center gap-4 sm:flex-row sm:gap-6">
            <Link
              href="/auth/signin"
              className="group flex h-12 w-full items-center justify-center gap-2 rounded-input bg-accent-blue px-7 text-sm font-semibold text-background-base shadow-[0_0_30px_rgba(79,195,247,0.35)] transition-all duration-interaction hover:brightness-110 active:scale-[0.98] sm:w-auto"
            >
              Open the app
              <span className="transition-transform group-hover:translate-x-0.5">→</span>
            </Link>
            <Link
              href="/get"
              className="group inline-flex min-h-[44px] items-center justify-center gap-1.5 text-sm font-medium text-text-secondary transition-colors duration-interaction hover:text-accent-blue"
            >
              Get the phone app
              <span aria-hidden className="transition-transform group-hover:translate-x-0.5">→</span>
            </Link>
          </div>

          <p data-reveal className="mt-4 text-xs text-text-muted">
            Works in your browser on any device, or as an app on iPhone and Android.{" "}
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
