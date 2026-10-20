import Link from "next/link";
import { LogoMark } from "@/components/layout/LogoMark";
import { SiteFooter } from "@/components/landing/SiteFooter";
import { DemoClient } from "@/components/demo/DemoClient";
import { pageMetadata } from "@/lib/site";

export const metadata = pageMetadata({
  title: "Try the demo - The Third Eye",
  description:
    "See The Third Eye work end to end with sample data: an inbox turned into tasks, answers from your own documents, a photo read into notes. No sign-in, nothing saved.",
  path: "/demo",
});

export default function DemoPage() {
  return (
    <div className="min-h-screen bg-background-base text-text-primary">
      <div className="mx-auto w-full max-w-4xl px-4 sm:px-5">
        <header className="flex items-center justify-between gap-3 py-5">
          <Link href="/" className="flex min-w-0 items-center gap-3" aria-label="The Third Eye home">
            <LogoMark size={32} />
            <span className="truncate font-display font-bold tracking-tight">The Third Eye</span>
          </Link>
          <Link
            href="/auth/signin"
            className="flex h-10 flex-none items-center justify-center rounded-input border border-accent-blue/40 px-4 text-sm font-medium text-accent-blue transition-colors hover:bg-accent-blue/10"
          >
            Sign in
          </Link>
        </header>

        <main id="main-content" className="pb-16">
          <div className="mb-6 mt-4">
            <span className="inline-flex items-center gap-2 rounded-full border border-accent-blue/30 bg-accent-blue/10 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.2em] text-accent-blue">
              Demo · sample data
            </span>
            <h1 className="mt-4 font-display text-3xl font-bold tracking-tight md:text-4xl">See it work in two minutes</h1>
            <p role="note" className="mt-3 max-w-2xl text-sm leading-relaxed text-text-secondary">
              This demo runs on built-in sample emails, a sample document and a sample photo. You don&apos;t need an
              account or any keys. Nothing you do here is uploaded, recorded or saved, and the assistant&apos;s replies
              are scripted examples of what the signed-in app returns.
            </p>
          </div>

          <DemoClient />
        </main>

        <SiteFooter />
      </div>
    </div>
  );
}
