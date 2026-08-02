import type { Offer } from "@/lib/calculators/offers";

// Renders intent-matched affiliate offers with the legally-required disclosure
// and rel="sponsored noopener" on every link. Renders nothing when there are no
// enabled offers, so a page never shows an empty or dead affiliate slot.
export function OfferBlock({ offers }: { offers: Offer[] }) {
  if (offers.length === 0) return null;
  return (
    <section className="mt-12" aria-label="Partner offers">
      <p className="mb-3 text-xs text-text-muted">
        Some links below are partner offers — if you sign up we may earn a commission, at no extra cost to you. We only
        list things worth recommending.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        {offers.map((o) => (
          <a
            key={o.id}
            href={o.url}
            target="_blank"
            rel="sponsored noopener noreferrer"
            className="block rounded-card border border-border-default bg-background-surface p-4 transition-colors hover:border-border-hover hover:shadow-cyan"
          >
            <h3 className="font-medium text-text-primary">{o.headline}</h3>
            <p className="mt-1.5 text-sm text-text-muted">{o.body}</p>
            <span className="mt-3 inline-block text-sm text-accent-blue">{o.cta} →</span>
            {o.footnote && <p className="mt-2 text-[11px] leading-snug text-text-muted/70">{o.footnote}</p>}
          </a>
        ))}
      </div>
    </section>
  );
}
