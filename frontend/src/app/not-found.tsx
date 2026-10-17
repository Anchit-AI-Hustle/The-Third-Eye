import Link from "next/link";

export const metadata = { title: "Page not found - The Third Eye" };

export default function NotFound() {
  return (
    <main id="main-content" className="min-h-screen flex items-center justify-center bg-background-base px-4">
      <div className="max-w-md w-full holo-card rounded-card p-8 text-center">
        <p className="font-mono text-xs tracking-[0.3em] text-accent-blue mb-3">// ERROR 404</p>
        <h1 className="font-display text-2xl font-bold text-text-primary mb-2">This page doesn&apos;t exist</h1>
        <p className="text-sm text-text-secondary mb-6">The link may be old or mistyped. Everything else is still here.</p>
        <div className="flex gap-3 justify-center">
          <Link href="/" className="rounded-input px-4 py-2.5 text-sm font-medium bg-accent-blue text-black">Go home</Link>
          <Link href="/assistant" className="rounded-input px-4 py-2.5 text-sm font-medium border border-border-default text-text-primary">Open JARVIS</Link>
        </div>
      </div>
    </main>
  );
}
