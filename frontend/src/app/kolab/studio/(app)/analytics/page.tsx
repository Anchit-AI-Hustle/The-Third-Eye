// web/app/(app)/analytics/page.tsx — real metrics only. Countable figures (planned posts, deals,
// linked channels, tracker progress, plan status) come from the user's own data; audience/reach
// numbers require channel OAuth (Phase 3) and are shown as "connect to see", never fabricated.
import { Eyebrow, Card } from "@/components/kolab-studio/ui";
import { GateBanner } from "@/components/kolab-studio/GateBanner";
import { getEntitlementContext } from "@/lib/kolab-studio/db";
import { canUseFeatures } from "@/lib/kolab-studio/entitlements";
import { getPlan, getDeals, getChannels } from "@/lib/kolab-studio/studio";
import { trackerProgress, TK_STATUSES, TK_LABEL } from "@/lib/kolab-studio/studioHelpers";
import { CHANNELS, TIERS } from "@/lib/kolab-studio/content";

export default async function AnalyticsPage() {
  const ctx = await getEntitlementContext();
  const unlocked = canUseFeatures(ctx);
  const [plan, deals, channels] = unlocked
    ? await Promise.all([getPlan(), getDeals(), getChannels()])
    : [[], [], []];

  const linked = channels.filter((c) => c.handle).length;
  const activeDeals = deals.filter((d) => d.active).length;
  const { posted, total, pct } = trackerProgress(
    plan.map((p) => ({ asset_type: p.asset_type, status: p.status, done: p.done })),
  );
  const planName = ctx.privileged
    ? "Complimentary"
    : ctx.subscriptionActive
      ? TIERS[(ctx.plan as "basic" | "pro") ?? "basic"]?.name ?? "Active"
      : "No plan";

  const byStatus = TK_STATUSES.map((s) => ({ s, n: plan.filter((p) => p.status === s).length }));

  const kpis = [
    { n: String(total), l: "Posts planned", d: "this cycle" },
    { n: `${posted}/${total}`, l: "Posted", d: `${pct}% complete` },
    { n: String(activeDeals), l: "Active deals", d: "on storefront" },
    { n: `${linked}/5`, l: "Channels linked", d: linked < 5 ? "connect more" : "all linked" },
    { n: planName, l: "Subscription", d: "" },
    { n: ctx.kycVerified ? "Verified" : "Pending", l: "Identity", d: "" },
  ];

  return (
    <div>
      <div className="mb-6 max-w-[64ch]">
        <Eyebrow>Your numbers, across everything</Eyebrow>
        <h2 className="mb-2 text-[clamp(24px,4vw,36px)]">Analytics</h2>
        <p className="text-[15px] text-kolab-muted">
          Content, deals and identity metrics from your own data. Audience &amp; engagement figures
          pull from your linked channels once connected (Phase 3–4) — nothing here is sampled or faked.
        </p>
      </div>
      <GateBanner ctx={ctx} />

      {unlocked && (
        <>
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(158px,1fr))]">
            {kpis.map((k) => (
              <Card key={k.l} className="p-4">
                <div className="font-kolab-display text-[27px] font-black leading-none">{k.n}</div>
                <div className="mt-1.5 font-kolab-mono text-[10px] uppercase tracking-[0.08em] text-kolab-muted">{k.l}</div>
                {k.d && <div className="mt-1.5 text-[11px] text-kolab-muted">{k.d}</div>}
              </Card>
            ))}
          </div>

          <h3 className="mb-3 mt-7 text-[18px]">Content pipeline</h3>
          <Card className="p-5">
            <div className="flex items-end gap-2.5" style={{ height: 150 }}>
              {byStatus.map(({ s, n }) => {
                const max = Math.max(1, ...byStatus.map((x) => x.n));
                return (
                  <div key={s} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
                    <div className="w-full rounded-t-md bg-gradient-to-b from-kolab-lime to-kolab-lime/30" style={{ height: `${(n / max) * 100}%`, minHeight: n ? 4 : 0 }} />
                    <div className="font-kolab-mono text-[10px] text-kolab-muted">{n}</div>
                    <div className="text-center font-kolab-mono text-[9px] uppercase text-kolab-muted">{TK_LABEL[s]}</div>
                  </div>
                );
              })}
            </div>
          </Card>

          <h3 className="mb-3 mt-7 text-[18px]">Channels</h3>
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
            {CHANNELS.map((c) => {
              const ch = channels.find((x) => x.platform === c.k);
              return (
                <Card key={c.k} className="p-4" style={{ borderTop: `3px solid ${c.c}` }}>
                  <div className="text-[14px] font-semibold">{c.n}</div>
                  <div className="mt-1 font-kolab-mono text-[10px] uppercase text-kolab-muted">
                    {ch?.handle ? `Linked · ${ch.handle}` : "Connect to see audience metrics"}
                  </div>
                </Card>
              );
            })}
          </div>
          <p className="mt-4 rounded-lg border border-dashed border-kolab-line bg-kolab-surface2 px-3.5 py-3 font-kolab-mono text-[11px] leading-relaxed text-kolab-faint">
            Follower, reach and engagement metrics require channel OAuth (Meta/Google/TikTok) + your
            affiliate network. Those land in Phase 3–4; until connected they are intentionally blank
            rather than estimated.
          </p>
        </>
      )}
    </div>
  );
}
