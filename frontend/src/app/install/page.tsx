import Link from "next/link";
import { InstallClient } from "@/components/install/InstallClient";
import { pageMetadata } from "@/lib/site";

export const metadata = pageMetadata({
  title: "Get the app - The Third Eye",
  description: "Install The Third Eye on Android with one tap, or add it to your iPhone home screen.",
  path: "/install",
});

export default function InstallPage() {
  return (
    <div className="min-h-screen bg-background-base py-16 px-4 sm:px-8">
      <div className="max-w-3xl mx-auto">
        <Link href="/" className="text-text-muted text-sm hover:text-text-secondary transition-colors">
          ← The Third Eye
        </Link>
        <h1 className="font-display text-3xl font-semibold text-text-primary mt-8">Get the app</h1>
        <p className="text-text-secondary text-sm mt-2 mb-10">
          The Third Eye on your phone, full screen, with voice. The app always runs the latest version, so you install it once.
        </p>
        <InstallClient />
      </div>
    </div>
  );
}
