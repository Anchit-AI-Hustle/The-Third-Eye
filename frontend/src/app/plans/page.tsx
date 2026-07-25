import { PlansClient } from "@/components/billing/PlansClient";

export const metadata = { title: "Plans & Credits — The Third Eye" };

export default function PlansPage() {
  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-5">
        <span className="hud-label text-accent-primary">// Membership</span>
        <h1 className="font-display text-2xl font-semibold text-text-primary">Plans & Credits</h1>
        <p className="text-text-muted text-xs font-mono mt-1 tracking-wider">
          Subscribe for personas & higher limits, or top up credits pay-as-you-go
        </p>
      </div>
      <PlansClient />
    </div>
  );
}
