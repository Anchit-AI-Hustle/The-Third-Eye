import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { KolabHub } from "@/components/kolab/KolabHub";

export const metadata = { title: "Kolab — Marketing AI — The Third Eye" };

export default function KolabPage() {
  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <span className="hud-label text-[#A78BFA]">// Marketing AI</span>
          <h1 className="font-display text-2xl font-semibold text-text-primary">Kolab</h1>
          <p className="text-text-muted text-xs font-mono mt-1 tracking-wider">
            Universal, brand-adaptable Lifecycle OS — describe any brand, get a complete marketing program
          </p>
        </div>
        <Link
          href="/kolab/studio/home"
          className="inline-flex items-center gap-1.5 rounded-input border border-border-default bg-background-surface px-3.5 py-2 text-xs font-mono text-text-secondary hover:text-text-primary hover:border-border-hover transition-colors"
        >
          Open Kolab Studio <ArrowRight size={13} />
        </Link>
      </div>
      <p className="mb-5 text-[11px] font-mono text-text-muted">
        This generator drafts a marketing program from a brand brief. For the full creator
        product — content calendar, scheduler, coupon storefront, brand deals, Aadhaar KYC and
        billing, embedded from the standalone <a href="https://github.com/Anchit-AI-Hustle/Kolab" target="_blank" rel="noopener noreferrer" className="underline hover:text-text-secondary">Kolab</a> repo —
        use <Link href="/kolab/studio/home" className="underline hover:text-text-secondary">Kolab Studio</Link>.
      </p>
      <KolabHub />
    </div>
  );
}
