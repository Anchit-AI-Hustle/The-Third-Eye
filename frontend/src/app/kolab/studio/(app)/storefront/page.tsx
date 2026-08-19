// web/app/(app)/storefront/page.tsx — follower-facing coupon page from the creator's active deals.
import { Eyebrow } from "@/components/kolab-studio/ui";
import { getMyProfile } from "@/lib/kolab-studio/db";
import { getDeals } from "@/lib/kolab-studio/studio";
import { StorefrontGrid } from "@/components/kolab-studio/StorefrontGrid";

export default async function StorefrontPage() {
  const [profile, deals] = await Promise.all([getMyProfile(), getDeals()]);
  const active = deals.filter((d) => d.active);
  const first = profile?.name?.split(" ")[0] || profile?.handle || null;

  return (
    <div>
      <div className="mb-6 max-w-[64ch]">
        <Eyebrow>Public storefront preview</Eyebrow>
        <h2 className="mb-2 text-[clamp(24px,4vw,36px)]">{first ? `Shop ${first}'s edit` : "Shop the edit"}</h2>
        <p className="text-[15px] text-kolab-muted">
          This is exactly what followers see. Share your public link; they shop on each brand&apos;s
          own site with your code.
        </p>
        {profile?.handle ? (
          <div className="mt-3 inline-flex items-center gap-2 rounded-lg border border-kolab-line bg-kolab-surface2 px-3 py-2 font-kolab-mono text-[12px] text-kolab-lime">
            <span className="text-kolab-muted">Your public link:</span>
            <a href={`/kolab-store/${profile.handle}`} target="_blank" rel="noopener">
              /kolab-store/{profile.handle}
            </a>
          </div>
        ) : (
          <div className="mt-3 font-kolab-mono text-[11px] text-kolab-faint">
            Set a handle in Profile Setup to get your shareable storefront link.
          </div>
        )}
      </div>
      <StorefrontGrid deals={active} />
    </div>
  );
}
