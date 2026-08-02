import type { Metadata } from "next";
import Link from "next/link";
import { calculators, categories } from "@/lib/calculators/data";
import { SITE_URL } from "@/lib/site";

const TITLE = "Free Financial Calculators — SIP, EMI, Loan, Retirement & More";
const DESCRIPTION =
  "A growing library of free financial calculators — SIP, lumpsum, compound interest, EMI, loan prepayment, retirement, inflation and more. No sign-up, instant results, everything runs in your browser.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    "financial calculator",
    "sip calculator",
    "emi calculator",
    "compound interest calculator",
    "retirement calculator",
    "loan calculator",
    "investment calculator",
  ],
  alternates: { canonical: "/calculators" },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: `${SITE_URL}/calculators`,
    type: "website",
    siteName: "The Third Eye",
  },
};

export default function CalculatorsIndexPage() {
  const itemListLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Financial Calculators",
    itemListElement: calculators.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.h1,
      url: `${SITE_URL}/calculators/${c.slug}`,
    })),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListLd) }} />

      <section className="mb-12">
        <p className="font-mono text-xs uppercase tracking-widest text-accent-blue">Calculators</p>
        <h1 className="mt-3 font-display text-3xl sm:text-4xl font-semibold text-text-primary">
          Financial calculators that don&apos;t waste your time
        </h1>
        <p className="mt-4 max-w-2xl text-text-secondary leading-relaxed">
          {calculators.length} free calculators for investing, loans, retirement and everyday money decisions. No
          sign-up, no ads-first nonsense — enter your numbers and see the answer instantly, with the maths shown.
        </p>
      </section>

      {categories.map((cat) => {
        const items = calculators.filter((c) => c.category === cat);
        if (items.length === 0) return null;
        return (
          <section key={cat} className="mb-10">
            <h2 className="mb-4 font-display text-lg font-semibold text-text-primary">{cat}</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((c) => (
                <Link
                  key={c.slug}
                  href={`/calculators/${c.slug}`}
                  className="group rounded-card border border-border-default bg-background-surface p-4 transition-colors hover:border-border-hover hover:shadow-cyan"
                >
                  <h3 className="font-medium text-text-primary group-hover:text-accent-blue transition-colors">
                    {c.h1}
                  </h3>
                  <p className="mt-1.5 text-sm text-text-muted line-clamp-2">{c.metaDescription}</p>
                </Link>
              ))}
            </div>
          </section>
        );
      })}
    </>
  );
}
