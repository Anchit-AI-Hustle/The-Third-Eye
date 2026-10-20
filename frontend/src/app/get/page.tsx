import Link from "next/link";
import { Download, Smartphone } from "lucide-react";
import { LogoMark } from "@/components/layout/LogoMark";
import { ANDROID_APK_URL, IOS_IPA_URL } from "@/lib/installPlatform";
import { pageMetadata } from "@/lib/site";

export const metadata = pageMetadata({
  title: "Download The Third Eye",
  description: "Download The Third Eye for Android and iPhone.",
  path: "/get",
});

const button = "flex w-full items-center justify-center gap-2 rounded-input bg-accent-blue px-5 h-12 text-sm font-semibold text-background-base shadow-[0_0_30px_rgba(79,195,247,0.35)] hover:brightness-110";
const secondary = "flex w-full items-center justify-center gap-2 rounded-input border border-accent-blue/40 px-5 h-11 text-sm font-semibold text-accent-blue hover:bg-accent-blue/10";

// The one link to send to a phone: every download on one page.
export default function GetPage() {
  return (
    <main className="min-h-screen bg-background-base px-4 py-12">
      <div className="mx-auto max-w-md space-y-6">
        <div className="flex flex-col items-center text-center">
          <LogoMark size={72} className="mb-4" />
          <h1 className="font-display text-2xl font-bold text-text-primary">Download The Third Eye</h1>
          <p className="mt-2 text-sm text-text-secondary">Pick your phone. Sign in once with Google after installing.</p>
        </div>

        <section className="holo-card rounded-card p-6 space-y-3">
          <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-text-primary">
            <Smartphone size={18} className="text-accent-blue" /> Android
          </h2>
          <a href={ANDROID_APK_URL} className={button}>
            <Download size={16} /> Download for Android
          </a>
          <p className="text-xs text-text-muted">Open the downloaded file and allow installs from your browser when asked.</p>
        </section>

        <section className="holo-card rounded-card p-6 space-y-3">
          <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-text-primary">
            <Smartphone size={18} className="text-accent-blue" /> iPhone and iPad
          </h2>
          <a href="/install/jarvis.mobileconfig" className={button}>
            <Download size={16} /> Install on iPhone
          </a>
          <p className="text-xs text-text-muted">Open this page in Safari, tap Allow, then Settings → Profile Downloaded → Install.</p>
          <a href={IOS_IPA_URL} className={secondary}>
            <Download size={15} /> Native iPhone app file (.ipa)
          </a>
          <p className="text-xs text-text-muted">
            The native app needs signing with your Apple ID: install it with Sideloadly or AltStore, or from a Mac with
            {" "}<code className="text-text-secondary">scripts/ios-free-install.sh</code>.
          </p>
        </section>

        <p className="text-center text-xs text-text-muted">
          <Link href="/install" className="hover:text-text-secondary">More install options</Link>
        </p>
      </div>
    </main>
  );
}
