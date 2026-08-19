// web/app/(app)/home/page.tsx — pack-aware home. Creator shows the offerings + entitlement gate;
// the brand/agency packs show their dashboard (vocabulary from lib/copy, modules from lib/packs)
// with an honest "in build" state per the spec's phased build order.
import { Card, Eyebrow, Pill } from "@/components/kolab-studio/ui";
import { GateBanner } from "@/components/kolab-studio/GateBanner";
import { OFFERINGS } from "@/lib/kolab-studio/content";
import { getEntitlementContext } from "@/lib/kolab-studio/db";
import { getActiveOrg } from "@/lib/kolab-studio/org";
import { getCopy } from "@/lib/kolab-studio/copy";
import { PACK_MODULES } from "@/lib/kolab-studio/packs";
import { starterJourneys } from "@/lib/kolab-studio/marketing/journeys";
import { generateCampaignCalendar } from "@/lib/kolab-studio/marketing/calendar";
import { RFM_SEGMENTS } from "@/lib/kolab-studio/marketing/rfm";

export default async function HomePage() {
  const active = await getActiveOrg();
  const pack = active?.org.type ?? "creator";

  if (pack === "creator") {
    const ctx = await getEntitlementContext();
    return (
      <div>
        <GateBanner ctx={ctx} />
        <div className="mb-6 max-w-[64ch]">
          <Eyebrow>Everything Kolab does</Eyebrow>
          <h2 className="mb-2 text-[clamp(24px,4vw,36px)]">Your whole creator business, in one place</h2>
          <p className="text-[15px] text-kolab-muted">
            Browse every offering below. Complete your profile and verify to unlock the tools — until
            then this is a full preview of what&apos;s inside.
          </p>
        </div>
        <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(250px,1fr))]">
          {OFFERINGS.map((o) => (
            <Card key={o.t} className="p-[22px]">
              <div className="mb-3.5 grid h-11 w-11 place-items-center rounded-xl bg-kolab-surface2 text-[22px]">{o.i}</div>
              <h3 className="mb-2 text-[18px]">{o.t}</h3>
              <p className="text-[14px] text-kolab-muted">{o.d}</p>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  // Brand / Agency packs — dashboard shell with pack vocabulary and module roadmap.
  const copy = getCopy(pack);
  const modules = PACK_MODULES[pack];
  const isLifecyclePack = pack === "commerce" || pack === "local";
  const journeys = isLifecyclePack ? starterJourneys(pack) : [];
  const moments = isLifecyclePack ? generateCampaignCalendar("IN", new Date(), 75) : [];

  return (
    <div>
      <div className="mb-6 max-w-[64ch]">
        <Eyebrow>{copy.homeEyebrow}</Eyebrow>
        <h2 className="mb-2 text-[clamp(24px,4vw,36px)]">{active?.org.name || copy.homeTitle}</h2>
        <p className="text-[15px] text-kolab-muted">{copy.homeSubtitle}</p>
      </div>

      <Card className="mb-6 flex flex-wrap items-center gap-3 p-4">
        <Pill tone="warn">In build</Pill>
        <span className="text-[13px] text-kolab-muted">
          The {copy.packLabel} pack is being built out. {copy.emptyDashboard}
        </span>
      </Card>

      {isLifecyclePack && (
        <>
          <h3 className="mb-3 text-[16px]">Starter journeys — switch on in draft</h3>
          <div className="mb-7 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]">
            {journeys.map((j) => (
              <Card key={j.id} className="p-4">
                <div className="mb-1 flex items-center gap-2">
                  <span className="font-kolab-mono text-[12px] font-bold text-kolab-ink">{j.name}</span>
                  <span className="rounded px-1.5 py-0.5 font-kolab-mono text-[8px] font-bold uppercase text-kolab-base" style={{ background: "var(--kolab-sky)" }}>
                    {j.channel}
                  </span>
                </div>
                <p className="text-[13px] text-kolab-muted">{j.description}</p>
                <div className="mt-2 font-kolab-mono text-[10px] uppercase text-kolab-faint">
                  {j.steps.length} step{j.steps.length > 1 ? "s" : ""} · cap 1 / {j.throttleDays}d
                </div>
              </Card>
            ))}
          </div>

          <h3 className="mb-3 text-[16px]">Upcoming moments (India · next 75 days)</h3>
          <div className="mb-7 grid gap-2.5 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
            {moments.length === 0 ? (
              <p className="text-[14px] text-kolab-muted">No major moments in the window.</p>
            ) : (
              moments.map((m) => (
                <Card key={m.date + m.name} className="p-3.5" style={{ borderLeft: `4px solid ${m.kind === "sale" ? "var(--kolab-clay)" : "var(--kolab-gold)"}` }}>
                  <div className="font-kolab-mono text-[10px] uppercase text-kolab-muted">{m.date}</div>
                  <div className="text-[14px] font-semibold">{m.name}</div>
                  <div className="mt-1 flex items-center gap-1.5">
                    <span className="font-kolab-mono text-[9px] uppercase text-kolab-faint">{m.kind}</span>
                    <span className="font-kolab-mono text-[9px] text-kolab-lime">w{m.weight}</span>
                  </div>
                </Card>
              ))
            )}
          </div>

          <h3 className="mb-3 text-[16px]">RFM segments</h3>
          <div className="mb-7 flex flex-wrap gap-2">
            {RFM_SEGMENTS.map((s) => (
              <Pill key={s}>{s}</Pill>
            ))}
          </div>
        </>
      )}

      <h3 className="mb-3 text-[16px]">What this pack ships</h3>
      <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
        {modules.map((m) => (
          <Card key={m} className="p-4">
            <div className="font-kolab-mono text-[12px] font-bold text-kolab-ink">{m}</div>
            <div className="mt-1 font-kolab-mono text-[10px] uppercase text-kolab-faint">Roadmap</div>
          </Card>
        ))}
      </div>
    </div>
  );
}
