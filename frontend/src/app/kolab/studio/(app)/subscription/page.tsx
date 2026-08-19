// web/app/(app)/subscription/page.tsx — plans. Server reads authoritative entitlement state;
// the pick action posts to /api/kolab-studio/billing (Razorpay stub in Phase 1).
import { Eyebrow } from "@/components/kolab-studio/ui";
import { getEntitlementContext } from "@/lib/kolab-studio/db";
import { PricingTiers } from "./PricingTiers";

export default async function SubscriptionPage() {
  const ctx = await getEntitlementContext();
  return (
    <div>
      <div className="mb-6 max-w-[64ch]">
        <Eyebrow>Simple, creator-friendly pricing</Eyebrow>
        <h2 className="mb-2 text-[clamp(24px,4vw,36px)]">Choose your plan</h2>
        <p className="text-[15px] text-kolab-muted">
          Every feature is paid. Aadhaar verification is required to use features on any plan.
          {ctx.privileged && " Your account has complimentary Pro access."}
        </p>
      </div>
      <PricingTiers privileged={ctx.privileged} currentPlan={ctx.subscriptionActive ? ctx.plan : null} />
    </div>
  );
}
