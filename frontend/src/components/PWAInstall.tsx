"use client";

import { useState, useEffect } from "react";
import { Download, X } from "lucide-react";

interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function PWAInstall() {
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
    <div className="fixed bottom-20 right-4 z-50 animate-slide-up">
      <div className="bg-background-elevated border border-border-default rounded-lg shadow-elevated p-3 flex items-center gap-3 max-w-xs">
        <button
          onClick={async () => {
            deferred?.prompt();
            await deferred?.userChoice;
            setDeferred(null);
            setShow(false);
          }}
          className="flex items-center gap-2 bg-accent-blue text-background-base px-3 py-2 rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
        >
          <Download size={14} />
          Install App
        </button>
        <button
          onClick={() => {
            localStorage.setItem("pwa-install-dismissed", "1");
            setShow(false);
          }}
          className="text-text-muted hover:text-text-primary transition-colors p-1"
          aria-label="Dismiss"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
