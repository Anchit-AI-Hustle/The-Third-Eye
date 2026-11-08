"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Smartphone, X } from "lucide-react";
import { installPlatform } from "@/lib/installPlatform";
import { inInstalledApp } from "@/lib/installedApp";

export const NUDGE_DELAY_MS = 30_000;
const DISMISSED_KEY = "te_get_app_nudge_dismissed_at";
const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;
const QUIET_PATHS = ["/get", "/install", "/auth"];

function onPhoneBrowser(): boolean {
  if (inInstalledApp()) return false;
  const p = installPlatform(navigator.userAgent, { touch: navigator.maxTouchPoints > 0, standalone: false });
  return p === "android" || p === "ios-safari" || p === "ios-other";
}

function snoozed(): boolean {
  try {
    return Date.now() - Number(localStorage.getItem(DISMISSED_KEY) || 0) < SNOOZE_MS;
  } catch {
    return false;
  }
}

/**
 * On a phone's browser the mobile website is used first; after 30 seconds of
 * use a banner offers the app, which installs from /get. Never shown on a
 * computer, inside the installed apps, or on the download and sign-in pages.
 */
export function GetAppNudge() {
  const pathname = usePathname() ?? "";
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!onPhoneBrowser() || snoozed()) return;
    const t = setTimeout(() => setShow(true), NUDGE_DELAY_MS);
    return () => clearTimeout(t);
  }, []);

  const dismiss = () => {
    setShow(false);
    try { localStorage.setItem(DISMISSED_KEY, String(Date.now())); } catch { /* private mode: shows again next visit */ }
  };

  if (!show || QUIET_PATHS.some((p) => pathname.startsWith(p))) return null;
  return (
    <div
      role="dialog"
      aria-label="Get the app"
      className="fixed inset-x-2 top-2 z-[70] flex items-center gap-3 rounded-card border border-accent-blue/30 bg-background-elevated/95 p-3 shadow-lg backdrop-blur"
      style={{ marginTop: "env(safe-area-inset-top)" }}
    >
      <Smartphone className="h-5 w-5 flex-none text-accent-blue" />
      <p className="min-w-0 flex-1 text-xs leading-snug text-text-secondary">
        <span className="font-semibold text-text-primary">The Third Eye app</span> is faster, with voice and reminders as notifications.
      </p>
      <Link href="/get" onClick={dismiss} className="flex h-9 flex-none items-center rounded-input bg-accent-blue px-3 text-xs font-semibold text-background-base">
        Get the app
      </Link>
      <button type="button" onClick={dismiss} aria-label="Not now" className="flex h-9 w-9 flex-none items-center justify-center rounded-input text-text-muted hover:text-text-primary">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
