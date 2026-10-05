"use client";

import { useState, useEffect } from "react";
import { Download, X } from "lucide-react";

interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function PWAInstall({ collapsed = false }: { collapsed?: boolean }) {
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
    <div className={`flex items-center gap-1 ${collapsed ? "justify-center px-1 py-1" : "px-2 pb-1"}`}>
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
        {!collapsed && "Install App"}
      </button>
      {!collapsed && (
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
      )}
    </div>
  );
}
