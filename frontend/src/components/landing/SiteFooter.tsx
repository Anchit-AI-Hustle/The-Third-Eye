import Link from "next/link";

const LINKS = [
  { href: "/demo", label: "Try the demo" },
  { href: "/install", label: "Get the app" },
  { href: "/capabilities", label: "Capabilities" },
  { href: "/privacy", label: "Privacy note" },
  { href: "/privacy_policy", label: "Privacy Policy" },
  { href: "/terms_of_service", label: "Terms of Service" },
];

export function SiteFooter() {
  return (
    <footer className="flex flex-col items-center justify-between gap-4 border-t border-border-default py-8 text-xs text-text-muted sm:flex-row">
      <span>© {new Date().getFullYear()} The Third Eye</span>

      <nav className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 font-mono" aria-label="Legal and product links">
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} className="transition-colors hover:text-text-secondary">
            {l.label}
          </Link>
        ))}
      </nav>
    </footer>
  );
}
