// web/app/s/[handle]/page.tsx — PUBLIC, shareable creator storefront (no auth required).
// This lives OUTSIDE /kolab/studio (which is NextAuth-gated) so followers can open it directly.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Logo } from "@/components/kolab-studio/Logo";
import { StorefrontGrid } from "@/components/kolab-studio/StorefrontGrid";
import { getPublicStorefront } from "@/lib/kolab-studio/storefront";

export async function generateMetadata(props: { params: Promise<{ handle: string }> }): Promise<Metadata> {
  const params = await props.params;
  const data = await getPublicStorefront(decodeURIComponent(params.handle)).catch(() => null);
  const who = data?.name || data?.handle || "Creator";
  return { title: `${who}'s storefront — Kolab`, description: `Shop ${who}'s picks with their codes.` };
}

export default async function PublicStorefrontPage(props: { params: Promise<{ handle: string }> }) {
  const params = await props.params;
  const data = await getPublicStorefront(decodeURIComponent(params.handle)).catch(() => null);
  if (!data) notFound();
  const first = data.name?.split(" ")[0] || data.handle;

  return (
    <main className="mx-auto max-w-[1120px] px-[clamp(16px,4vw,30px)]">
      <header className="flex items-center justify-between py-4">
        <Logo />
        <Link href="/kolab" className="font-kolab-mono text-[11px] uppercase tracking-[0.1em] text-kolab-muted hover:text-kolab-ink">
          Powered by Kolab
        </Link>
      </header>

      <section className="py-6">
        <div className="mb-1 font-kolab-mono text-[11px] uppercase tracking-[0.16em] text-kolab-lime">@{data.handle}</div>
        <h1 className="mb-2 text-[clamp(24px,4vw,40px)]">Shop {first}&apos;s edit</h1>
        <p className="mb-6 max-w-[52ch] text-[15px] text-kolab-muted">
          Hand-picked deals — tap a code to copy it, then shop on each brand&apos;s own site.
        </p>
        <StorefrontGrid deals={data.deals} />
      </section>
    </main>
  );
}
