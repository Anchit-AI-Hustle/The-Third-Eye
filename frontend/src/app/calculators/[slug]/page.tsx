import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { bySlug, calculators } from "@/lib/calculators/data";
import { offersFor } from "@/lib/calculators/offers";
import { SITE_URL } from "@/lib/site";
import { CalculatorRunner } from "@/components/calculators/CalculatorRunner";
import { OfferBlock } from "@/components/calculators/OfferBlock";

export function generateStaticParams() {
  return calculators.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata(props: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const params = await props.params;
  const c = bySlug[params.slug];
  if (!c) return {};
  const url = `${SITE_URL}/calculators/${c.slug}`;
  return {
    title: c.metaTitle,
    description: c.metaDescription,
    keywords: c.keywords,
    alternates: { canonical: `/calculators/${c.slug}` },
    openGraph: {
      title: c.metaTitle,
      description: c.metaDescription,
      url,
      type: "website",
      siteName: "The Third Eye",
    },
  };
}

export default async function CalculatorPage(props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  const c = bySlug[params.slug];
  if (!c) notFound();

  const url = `${SITE_URL}/calculators/${c.slug}`;
  const paragraphs = c.intro.split("\n\n").filter(Boolean);
  const related = c.related.map((slug) => bySlug[slug]).filter(Boolean);

  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: c.faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
  const appLd = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: c.h1,
    url,
    applicationCategory: "FinanceApplication",
    operatingSystem: "Any",
    offers: { "@type": "Offer", price: "0", priceCurrency: "INR" },
    description: c.metaDescription,
  };
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Calculators", item: `${SITE_URL}/calculators` },
      { "@type": "ListItem", position: 2, name: c.h1, item: url },
    ],
  };

  return (
    <article>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(appLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />

      <nav className="mb-6 text-xs text-text-muted" aria-label="Breadcrumb">
        <Link href="/calculators" className="hover:text-accent-blue transition-colors">
          Calculators
        </Link>
        <span className="mx-2">/</span>
        <span className="text-text-secondary">{c.category}</span>
      </nav>

      <header className="mb-8">
        <h1 className="font-display text-3xl font-semibold text-text-primary">{c.h1}</h1>
        <div className="mt-4 space-y-4 max-w-2xl text-text-secondary leading-relaxed">
          {paragraphs.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
      </header>

      <CalculatorRunner calculator={c} />

      <OfferBlock offers={offersFor(c.offerTags ?? [])} />

      <section className="mt-12">
        <h2 className="mb-4 font-display text-lg font-semibold text-text-primary">How it works</h2>
        <ol className="space-y-3 max-w-2xl">
          {c.howItWorks.map((step, i) => (
            <li key={i} className="flex gap-3 text-sm text-text-secondary leading-relaxed">
              <span className="mt-0.5 shrink-0 font-mono text-xs text-accent-blue">{String(i + 1).padStart(2, "0")}</span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-12">
        <h2 className="mb-4 font-display text-lg font-semibold text-text-primary">Frequently asked</h2>
        <div className="max-w-2xl divide-y divide-border-default rounded-card border border-border-default">
          {c.faqs.map((f, i) => (
            <details key={i} className="group px-4 py-3">
              <summary className="cursor-pointer list-none font-medium text-text-primary marker:hidden [&::-webkit-details-marker]:hidden flex justify-between gap-3">
                {f.q}
                <span className="text-text-muted transition-transform group-open:rotate-45">+</span>
              </summary>
              <p className="mt-2 text-sm text-text-secondary leading-relaxed">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {related.length > 0 && (
        <section className="mt-12">
          <h2 className="mb-4 font-display text-lg font-semibold text-text-primary">Related calculators</h2>
          <div className="flex flex-wrap gap-2">
            {related.map((r) => (
              <Link
                key={r.slug}
                href={`/calculators/${r.slug}`}
                className="rounded-badge border border-border-default bg-background-surface px-3 py-1.5 text-sm text-text-secondary hover:border-border-hover hover:text-accent-blue transition-colors"
              >
                {r.h1}
              </Link>
            ))}
          </div>
        </section>
      )}
    </article>
  );
}
