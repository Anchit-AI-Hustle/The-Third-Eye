"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Download, PlusSquare, Share, Smartphone } from "lucide-react";
import { ANDROID_APK_URL, installPlatform, type InstallPlatform } from "@/lib/installPlatform";

function AndroidCard({ primary }: { primary: boolean }) {
  return (
    <section className="holo-card rounded-card p-6">
      <div className="flex items-center gap-3 mb-4">
        <Smartphone size={20} className="text-accent-blue" />
        <h2 className="font-display text-lg font-semibold text-text-primary">Android</h2>
      </div>
      <a
        href={ANDROID_APK_URL}
        className={`inline-flex items-center gap-2 rounded-card px-5 py-3 text-sm font-semibold transition-opacity hover:opacity-90 ${primary ? "bg-accent-blue text-background-base" : "border border-accent-blue/40 text-accent-blue"}`}
      >
        <Download size={16} /> Download for Android
      </a>
      <ol className="mt-4 space-y-1.5 text-sm text-text-secondary list-decimal pl-5">
        <li>Open the downloaded file.</li>
        <li>If asked, allow installs from your browser, then tap Install.</li>
      </ol>
    </section>
  );
}

function IosCard({ inSafari }: { inSafari: boolean }) {
  return (
    <section className="holo-card rounded-card p-6">
      <div className="flex items-center gap-3 mb-4">
        <Smartphone size={20} className="text-accent-blue" />
        <h2 className="font-display text-lg font-semibold text-text-primary">iPhone and iPad</h2>
      </div>
      {!inSafari && (
        <p className="mb-3 text-sm text-text-primary">Open this page in Safari first: Apple only lets Safari add apps to the home screen.</p>
      )}
      <ol className="space-y-2.5 text-sm text-text-secondary">
        <li className="flex items-center gap-2"><span className="text-text-muted">1.</span> Tap <Share size={16} className="text-accent-blue" aria-label="Share" /> Share in Safari&apos;s toolbar.</li>
        <li className="flex items-center gap-2"><span className="text-text-muted">2.</span> Tap <PlusSquare size={16} className="text-accent-blue" aria-hidden="true" /> Add to Home Screen, then Add.</li>
        <li className="flex items-center gap-2"><span className="text-text-muted">3.</span> Open JARVIS from your home screen. It runs full screen, with voice.</li>
      </ol>
    </section>
  );
}

export function InstallClient() {
  const [platform, setPlatform] = useState<InstallPlatform | null>(null);

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
    setPlatform(installPlatform(navigator.userAgent, { touch: navigator.maxTouchPoints > 1, standalone }));
  }, []);

  if (platform === "installed") {
    return (
      <p className="flex items-center gap-2 text-sm text-text-primary">
        <CheckCircle2 size={18} className="text-success" /> You are already using the installed app.
      </p>
    );
  }
  if (platform === "android") return <AndroidCard primary />;
  if (platform === "ios-safari" || platform === "ios-other") return <IosCard inSafari={platform === "ios-safari"} />;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <AndroidCard primary={false} />
      <IosCard inSafari />
    </div>
  );
}
