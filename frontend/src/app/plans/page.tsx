import { headers } from "next/headers";
import { PlansClient } from "@/components/billing/PlansClient";
import { razorpayFor } from "@/lib/razorpay";

export const metadata = { title: "Plans & Credits - The Third Eye" };

export default async function PlansPage() {
  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-5">
        <span className="hud-label text-accent-blue">Membership</span>
        <h1 className="font-display text-2xl font-semibold text-text-primary">Plans & Credits</h1>
        <p className="text-text-muted text-sm mt-1">
          Subscribe for personas & higher limits, or top up credits pay-as-you-go
        </p>
      </div>
      <PlansClient razorpay={razorpayFor((await headers()).get("x-vercel-ip-country"))} />
    </div>
  );
}
