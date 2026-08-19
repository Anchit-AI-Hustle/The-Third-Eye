// web/app/(app)/setup/page.tsx — manage profile, verify Aadhaar (Phase-2 stub), link channels.
import { Eyebrow } from "@/components/kolab-studio/ui";
import { getMyProfile, getEntitlementContext } from "@/lib/kolab-studio/db";
import { canUsePro } from "@/lib/kolab-studio/entitlements";
import { getChannels } from "@/lib/kolab-studio/studio";
import { SetupForm } from "./SetupForm";
import { ChannelsManager } from "./ChannelsManager";

export default async function SetupPage() {
  const [p, ctx, channels] = await Promise.all([
    getMyProfile(),
    getEntitlementContext(),
    getChannels(),
  ]);
  return (
    <div>
      <div className="mb-6 max-w-[64ch]">
        <Eyebrow>Manage everything</Eyebrow>
        <h2 className="mb-2 text-[clamp(24px,4vw,36px)]">Profile setup</h2>
        <p className="text-[15px] text-kolab-muted">
          Edit your details, link channels, and verify your identity. Website + ad connectors unlock
          on Pro (or for complimentary accounts).
        </p>
      </div>
      <SetupForm
        initial={{
          name: p?.name ?? "",
          handle: p?.handle ?? "",
          dob: p?.dob ?? "",
          pincode: p?.pincode ?? "",
          website_url: p?.website_url ?? "",
          city: p?.city ?? "",
          state: p?.state ?? "",
          country: p?.country ?? "",
        }}
        kycVerified={ctx.kycVerified}
        canPro={canUsePro(ctx)}
      />
      <div className="mt-6">
        <h3 className="mb-3 text-[18px]">Social channels</h3>
        <ChannelsManager
          initial={channels.map((c) => ({ platform: c.platform, handle: c.handle ?? "" }))}
        />
      </div>
    </div>
  );
}
