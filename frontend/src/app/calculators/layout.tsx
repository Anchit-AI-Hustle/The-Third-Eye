import Link from "next/link";
import type { ReactNode } from "react";

// Public, no-auth chrome for the calculators section. /calculators/* is
// intentionally excluded from the auth middleware matcher, so these pages are
// crawlable and shareable.
export default function CalculatorsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background-base text-text-primary flex flex-col">
      <header className="border-b border-border-default">
        <div className="mx-auto max-w-5xl px-6 h-14 flex items-center justify-between">
          <Link href="/" className="font-display font-semibold text-text-primary hover:text-accent-blue transition-colors">
            The Third Eye
          </Link>
          <Link href="/calculators" className="text-sm text-text-secondary hover:text-accent-blue transition-colors">
            All calculators
          </Link>
        </div>
      </header>

      <main id="main-content" className="flex-1 mx-auto w-full max-w-5xl px-6 py-10">
        {children}
      </main>

      <footer className="border-t border-border-default">
        <div className="mx-auto max-w-5xl px-6 py-8 text-xs text-text-muted flex flex-wrap gap-x-6 gap-y-2 justify-between">
          <span>Free financial calculators — no sign-up, instant, private.</span>
          <span className="flex gap-4">
            <Link href="/privacy_policy" className="hover:text-text-secondary transition-colors">
              Privacy
            </Link>
            <Link href="/terms_of_service" className="hover:text-text-secondary transition-colors">
              Terms
            </Link>
          </span>
        </div>
      </footer>
    </div>
  );
}
