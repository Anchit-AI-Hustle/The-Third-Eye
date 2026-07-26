"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import { Sidebar } from "./Sidebar";
import { BottomNav } from "./BottomNav";
import { VoiceOverlay } from "../voice/VoiceOverlay";

interface MainLayoutProps {
  children: React.ReactNode;
  mainClassName?: string;
}

export function MainLayout({ children, mainClassName }: MainLayoutProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="flex h-screen bg-background-base overflow-hidden">
      {/* Mobile hamburger button — visible below lg breakpoint */}
      <button
        onClick={() => setMobileMenuOpen(true)}
        className="lg:hidden fixed top-3 left-3 z-30 p-2 rounded-lg bg-background-surface border border-border-default text-text-secondary hover:text-text-primary hover:bg-background-elevated transition-colors shadow-md"
        aria-label="Open menu"
      >
        <Menu size={20} />
      </button>

      <Sidebar mobileOpen={mobileMenuOpen} onMobileClose={() => setMobileMenuOpen(false)} />
      <main
        id="main-content"
        tabIndex={-1}
        className={
          mainClassName ??
          "flex-1 overflow-y-auto pt-[env(safe-area-inset-top)] lg:pt-0 pb-[calc(4rem_+_env(safe-area-inset-bottom))] lg:pb-10 pl-14 lg:pl-0"
        }
      >
        {children}
      </main>
      <BottomNav />
      <VoiceOverlay />
    </div>
  );
}
