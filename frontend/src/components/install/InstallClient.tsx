"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { CheckCircle2, Download, Smartphone } from "lucide-react";
import { ANDROID_APK_URL, IOS_IPA_URL, installPlatform, type InstallPlatform } from "@/lib/installPlatform";
import { SITE_URL } from "@/lib/site";

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
        <li>Tap Allow.</li>
        <li>Open Settings, tap Profile Downloaded, then Install.</li>
      </ol>
      <p className="mt-3 text-sm text-text-secondary">The Third Eye is now on your home screen.</p>
      <details className="mt-5 border-t border-border-default pt-4 text-sm text-text-secondary">
        <summary className="cursor-pointer text-text-primary">Native iPhone app (needs a Mac)</summary>
        <p className="mt-2">
          The native app syncs all your contacts, photos and a folder of files on its own. Apple only lets a free account install it from a Mac: connect the iPhone and run{" "}
          <code className="text-text-primary">scripts/ios-free-install.sh</code> from the project. It needs re-running every 7 days.
        </p>
        <a href={IOS_IPA_URL} className="mt-3 inline-flex items-center gap-2 rounded-card border border-accent-blue/40 px-4 py-2 text-sm font-semibold text-accent-blue hover:opacity-90">
          <Download size={15} /> Download iOS app file (for Sideloadly or AltStore)
        </a>
      </details>
    </section>
  );
}

const GET_URL = `${SITE_URL}/get`;

function PhoneQr() {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    QRCode.toString(GET_URL, { type: "svg", margin: 1, color: { dark: "#000000", light: "#ffffff" } })
      .then((svg) => setSrc(`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`));
  }, []);
  return (
    <section className="holo-card rounded-card p-6 flex flex-col sm:flex-row items-center gap-6">
      <div className="w-44 h-44 flex-none rounded-card bg-white p-2">
        {src && <img src={src} alt="Scan to install The Third Eye on your phone" className="w-full h-full" />}
      </div>
      <div>
        <h2 className="font-display text-lg font-semibold text-text-primary">Point your phone camera here</h2>
        <p className="mt-2 text-sm text-text-secondary">Android downloads the app. iPhone puts it on your home screen.</p>
        <p className="mt-3 text-sm text-text-secondary">Or open <span className="text-accent-blue">{GET_URL.replace(/^https?:\/\//, "")}</span> on your phone.</p>
      </div>
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
    <div className="space-y-4">
      <PhoneQr />
      <div className="grid gap-4 sm:grid-cols-2">
        <AndroidCard primary={false} />
        <IosCard inSafari />
      </div>
    </div>
  );
}
