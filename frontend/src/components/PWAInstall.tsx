"use client";

import { useState, useEffect } from "react";
import { Download, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function PWAInstall({ collapsed = false, narrowOpen = false }: { collapsed?: boolean; narrowOpen?: boolean }) {
  const [deferred, setDeferred] = useState<InstallPrompt | null>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (localStorage.getItem("pwa-install-dismissed")) return;

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferred(e as InstallPrompt);
      setShow(true);
    };

    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  if (!show) return null;

  return (
    <div className={cn(
      "flex items-center gap-1 px-2 pb-1",
      !narrowOpen && "max-lg:justify-center max-lg:px-1",
      collapsed && "lg:justify-center lg:px-1",
    )}>
      <button
        onClick={async () => {
          deferred?.prompt();
          await deferred?.userChoice;
          setDeferred(null);
          setShow(false);
        }}
        title="Install App"
        className="flex items-center gap-2 bg-accent-blue text-background-base px-2.5 py-1.5 rounded-md text-xs font-medium hover:opacity-90 transition-opacity"
      >
        <Download size={14} />
        <span className={cn(!narrowOpen && "max-lg:hidden", collapsed && "lg:hidden")}>Install App</span>
      </button>
      <button
        onClick={() => {
          localStorage.setItem("pwa-install-dismissed", "1");
          setShow(false);
        }}
        className={cn(
          "text-text-muted hover:text-text-primary transition-colors p-1",
          !narrowOpen && "max-lg:hidden",
          collapsed && "lg:hidden",
        )}
        aria-label="Dismiss"
      >
        <X size={14} />
      </button>
    </div>
  );
}
