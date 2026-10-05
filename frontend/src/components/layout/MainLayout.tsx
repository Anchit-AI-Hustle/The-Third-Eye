"use client";

import { Sidebar } from "./Sidebar";
import { BottomNav } from "./BottomNav";
import { VoiceOverlay } from "../voice/VoiceOverlay";

interface MainLayoutProps {
  children: React.ReactNode;
  mainClassName?: string;
}

export function MainLayout({ children, mainClassName }: MainLayoutProps) {
  return (
    <div className="flex h-screen bg-background-base overflow-hidden">
      <Sidebar />
      <main
        id="main-content"
        tabIndex={-1}
        className={
          mainClassName ??
          "flex-1 min-w-0 overflow-y-auto pt-[env(safe-area-inset-top)] lg:pt-0 pb-[calc(9rem_+_env(safe-area-inset-bottom))] lg:pb-28 pr-16 lg:pr-40"
        }
      >
        {children}
      </main>
      <BottomNav />
      <VoiceOverlay />
    </div>
  );
}
