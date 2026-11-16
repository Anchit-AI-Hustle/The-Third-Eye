"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { LogoMark } from "@/components/layout/LogoMark";

const NAV_LINKS = [
  { href: "#features", label: "Features" },
  { href: "#how-it-works", label: "How it works" },
  { href: "#faq", label: "FAQ" },
  { href: "/get", label: "Get the app" },
];

export function LandingNav() {
  const [open, setOpen] = useState(false);

  return (
    <header className="relative z-20 py-5">
      <div className="flex items-center justify-between gap-4">
        <Link
          href="/"
          className="flex min-h-[44px] items-center gap-3 rounded-input transition-opacity hover:opacity-90"
          aria-label="The Third Eye home"
        >
          <LogoMark size={36} />
          <span className="font-display font-bold tracking-tight">The Third Eye</span>
        </Link>

        <nav className="hidden items-center gap-6 md:flex" aria-label="Primary">
          {NAV_LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="text-sm text-text-secondary transition-colors duration-interaction hover:text-text-primary"
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Link
            href="/auth/signin"
            className="flex h-11 items-center justify-center rounded-input bg-accent-blue px-4 text-sm font-semibold text-background-base transition-all duration-interaction hover:brightness-110 active:scale-[0.98]"
          >
            Sign in
          </Link>

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="landing-mobile-menu"
            aria-label={open ? "Close navigation menu" : "Open navigation menu"}
            className="flex h-11 w-11 items-center justify-center rounded-input border border-border-default bg-background-surface text-text-secondary transition-colors duration-interaction hover:border-accent-blue/40 hover:text-text-primary md:hidden"
          >
            {open ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </div>

      {open && (
        <nav
          id="landing-mobile-menu"
          aria-label="Mobile navigation"
          className="mt-3 flex flex-col gap-1 rounded-card border border-border-default bg-background-surface/95 p-3 backdrop-blur-md md:hidden"
        >
          {NAV_LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              className="flex min-h-[44px] items-center rounded-input px-3 text-sm text-text-secondary transition-colors duration-interaction hover:bg-background-elevated hover:text-text-primary"
            >
              {l.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}
