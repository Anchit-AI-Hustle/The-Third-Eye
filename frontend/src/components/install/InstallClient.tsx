"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Download, PlusSquare, Share, Smartphone } from "lucide-react";
import { ANDROID_APK_URL, IOS_IPA_URL, installPlatform, type InstallPlatform } from "@/lib/installPlatform";

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
        <p className="mb-3 text-sm text-text-primary">Open this page in Safari first: Apple only installs from Safari.</p>
      )}
      <a
        href="/install/jarvis.mobileconfig"
        className="inline-flex items-center gap-2 rounded-card bg-accent-blue px-5 py-3 text-sm font-semibold text-background-base transition-opacity hover:opacity-90"
      >
        <Download size={16} /> Install on iPhone
      </a>
      <ol className="mt-4 space-y-1.5 text-sm text-text-secondary list-decimal pl-5">
        <li>Tap Allow when Safari asks to download the profile.</li>
        <li>Open Settings, tap Profile Downloaded at the top, then Install.</li>
        <li>The Third Eye appears on your home screen and opens full screen, with voice.</li>
      </ol>
      <p className="mt-4 text-sm text-text-secondary flex flex-wrap items-center gap-1">
        Or in Safari: <Share size={15} className="text-accent-blue" aria-label="Share" /> Share, then <PlusSquare size={15} className="text-accent-blue" aria-hidden="true" /> Add to Home Screen.
      </p>
      <details className="mt-5 border-t border-border-default pt-4 text-sm text-text-secondary">
        <summary className="cursor-pointer text-text-primary">Native iOS app (advanced)</summary>
        <p className="mt-2">
          Apple installs only signed apps. Download the app file on a computer, then install it to your iPhone with{" "}
          <a href="https://sideloadly.io" className="text-accent-blue hover:underline" rel="noopener noreferrer" target="_blank">Sideloadly</a>{" "}
          or{" "}
          <a href="https://altstore.io" className="text-accent-blue hover:underline" rel="noopener noreferrer" target="_blank">AltStore</a>{" "}
          and your Apple ID. With a free Apple ID it needs re-signing every 7 days.
        </p>
        <a href={IOS_IPA_URL} className="mt-3 inline-flex items-center gap-2 rounded-card border border-accent-blue/40 px-4 py-2 text-sm font-semibold text-accent-blue hover:opacity-90">
          <Download size={15} /> Download iOS app file
        </a>
      </details>
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
