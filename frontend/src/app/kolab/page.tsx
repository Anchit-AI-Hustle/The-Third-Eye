import { KolabHub } from "@/components/kolab/KolabHub";

export const metadata = { title: "Kolab — Marketing AI — The Third Eye" };

export default function KolabPage() {
  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-5">
        <span className="hud-label text-[#A78BFA]">// Marketing AI</span>
        <h1 className="font-display text-2xl font-semibold text-text-primary">Kolab</h1>
        <p className="text-text-muted text-xs font-mono mt-1 tracking-wider">
          Universal, brand-adaptable Lifecycle OS — describe any brand, get a complete marketing program
        </p>
      </div>
      <KolabHub />
    </div>
  );
}
