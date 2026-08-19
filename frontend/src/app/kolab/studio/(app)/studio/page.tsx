// web/app/(app)/studio/page.tsx — Creator Studio. Loads the user's studio data (RLS-scoped)
// on the server and hands it to the client module UI. Mutations go through /api/kolab-studio/studio/*.
import { Eyebrow } from "@/components/kolab-studio/ui";
import { GateBanner } from "@/components/kolab-studio/GateBanner";
import { getEntitlementContext } from "@/lib/kolab-studio/db";
import { canUseFeatures } from "@/lib/kolab-studio/entitlements";
import { getPillars, getPlan, getDeals, getSchedule, getChannels } from "@/lib/kolab-studio/studio";
import { StudioClient } from "./StudioClient";

export default async function StudioPage() {
  const ctx = await getEntitlementContext();
  const unlocked = canUseFeatures(ctx);

  // Only load data once the gate is open (RLS would return the user's rows regardless, but
  // there's nothing to show a locked user).
  const [pillars, plan, deals, schedule, channels] = unlocked
    ? await Promise.all([getPillars(), getPlan(), getDeals(), getSchedule(), getChannels()])
    : [[], [], [], [], []];

  return (
    <div>
      <div className="mb-6 max-w-[64ch]">
        <Eyebrow>Plan · schedule · sell</Eyebrow>
        <h2 className="mb-2 text-[clamp(24px,4vw,36px)]">Creator Studio</h2>
        <p className="text-[15px] text-kolab-muted">
          Your content calendar, multi-channel scheduler, and coupon deals — all feeding your public
          storefront.
        </p>
      </div>
      <GateBanner ctx={ctx} />
      {unlocked && (
        <StudioClient
          pillars={pillars}
          plan={plan}
          deals={deals}
          schedule={schedule}
          channels={channels}
        />
      )}
    </div>
  );
}
