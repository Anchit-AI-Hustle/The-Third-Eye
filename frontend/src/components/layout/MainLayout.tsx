"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { Sidebar } from "./Sidebar";
import { BottomNav } from "./BottomNav";
import { VoiceOverlay } from "../voice/VoiceOverlay";
import { AiStatusBanner } from "./AiStatusBanner";
import { AmbientScene } from "../hud/AmbientScene";
import { MotionNotice } from "../hud/MotionNotice";
import { NativeAutoSync } from "./NativeAutoSync";
import { useJarvisTriggers } from "@/hooks/useJarvisTriggers";
import { activateAssistant } from "@/lib/activation";
import { cn } from "@/lib/utils";

interface MainLayoutProps {
  children: React.ReactNode;
  mainClassName?: string;
}

export function MainLayout({ children, mainClassName }: MainLayoutProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const pathname = usePathname();
  const [nativeApp, setNativeApp] = useState(false);
  useEffect(() => setNativeApp(!!(window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.()), []);
  useJarvisTriggers(activateAssistant);

  return (
    <div className="relative flex h-screen bg-background-base overflow-hidden">
      <AmbientScene />
      {/* Mobile hamburger button — visible below lg breakpoint.
          Insets are on the button itself: the scroll container below applies
          the top inset as padding, but this is `fixed`, so it never inherited
          it. On a notched phone it sat under the status bar, overlapping the
          clock and swallowing its taps. */}
      <button
        onClick={() => setMobileMenuOpen(true)}
        className="lg:hidden fixed top-[calc(0.75rem_+_env(safe-area-inset-top))] left-[calc(0.75rem_+_env(safe-area-inset-left))] z-30 p-2 rounded-lg bg-background-surface border border-border-default text-text-secondary hover:text-text-primary hover:bg-background-elevated transition-colors shadow-md"
        aria-label="Open menu"
      >
        <Menu size={20} />
      </button>

      <Sidebar mobileOpen={mobileMenuOpen} onMobileClose={() => setMobileMenuOpen(false)} />
      <main
        id="main-content"
        tabIndex={-1}
        className={cn(
          mainClassName ??
          "flex-1 overflow-y-auto pt-[calc(3.5rem_+_env(safe-area-inset-top))] sm:pt-[env(safe-area-inset-top)] lg:pt-0 pb-[calc(9rem_+_env(safe-area-inset-bottom))] lg:pb-28 sm:pl-14 sm:pr-16 lg:pl-0 lg:pr-40",
          "relative z-[1]",
        )}
      >
        {/* A page with its own <main> layout (the assistant) is a flex column whose
            content fills what the banner leaves; the wrapper must pass that on. */}
        <AiStatusBanner clearMenu={!!mainClassName} />
        <div key={pathname} className={cn("page-enter", mainClassName ? "flex-1 min-h-0 flex flex-col" : "h-full")}>{children}</div>
      </main>
      {/* Page change: a holographic shutter swings away and a scan line sweeps the screen. */}
      <div key={`shutter-${pathname}`} className="route-shutter" aria-hidden="true"><span /><span /></div>
      <div key={pathname} className="route-scan" aria-hidden="true" />
      <MotionNotice />
      {nativeApp && <NativeAutoSync />}
      <BottomNav />
      <VoiceOverlay />
    </div>
  );
}
