// web/app/(app)/profile/page.tsx — the public-facing profile as brands/followers see it.
import { Card, Eyebrow, Pill } from "@/components/kolab-studio/ui";
import { getMyProfile, getEntitlementContext } from "@/lib/kolab-studio/db";
import { getChannels } from "@/lib/kolab-studio/studio";
import { CHANNELS } from "@/lib/kolab-studio/content";
import { ageFromDob } from "@/lib/kolab-studio/validation";

export default async function ProfilePage() {
  const [p, ctx, channels] = await Promise.all([
    getMyProfile(),
    getEntitlementContext(),
    getChannels(),
  ]);
  const name = p?.name || "New creator";
  const initials = (name || "?").trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const age = p?.dob ? ageFromDob(p.dob) : null;
  const linked = channels.filter((c) => c.handle);
  const chName = (k: string) => CHANNELS.find((c) => c.k === k)?.n ?? k;

  return (
    <div>
      <div className="mb-6">
        <Eyebrow>As followers &amp; brands see you</Eyebrow>
        <h2 className="text-[clamp(24px,4vw,36px)]">Your profile</h2>
      </div>

      <Card className="flex flex-wrap items-center gap-5 p-6">
        <div className="grid h-[88px] w-[88px] flex-none place-items-center overflow-hidden rounded-[20px] bg-gradient-to-br from-kolab-lime to-kolab-violet font-kolab-display text-[34px] font-black text-kolab-base">
          {initials}
        </div>
        <div>
          <h2 className="text-[26px]">{name}</h2>
          <div className="my-2.5 font-kolab-mono text-[12px] text-kolab-muted">
            {p?.handle || "@—"}
            {p?.website_url && (
              <>
                {" · "}
                <a href={p.website_url} target="_blank" rel="noopener" className="text-kolab-lime">
                  {p.website_url}
                </a>
              </>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {ctx.kycVerified ? <Pill tone="ok">✓ Aadhaar verified</Pill> : <Pill tone="warn">Unverified</Pill>}
            {ctx.privileged ? (
              <Pill tone="ok">Complimentary · Pro</Pill>
            ) : ctx.subscriptionActive ? (
              <Pill tone="ok">{ctx.plan ?? "Active"}</Pill>
            ) : (
              <Pill tone="lock">No plan</Pill>
            )}
          </div>
        </div>
      </Card>

      <Card className="mt-4 p-[22px]">
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(160px,1fr))]">
          <Field k="Age" v={age !== null ? `${age} yrs` : "—"} />
          <Field k="DOB" v={p?.dob || "—"} />
          <Field k="Location" v={[p?.city, p?.state, p?.country].filter(Boolean).join(", ") || "—"} />
          <Field k="Pincode" v={p?.pincode || "—"} />
        </div>
        <div className="mt-4">
          <div className="mb-2 font-kolab-mono text-[10px] uppercase text-kolab-muted">Channels</div>
          <div className="flex flex-wrap gap-2">
            {linked.length ? (
              linked.map((c) => (
                <Pill key={c.id}>
                  {chName(c.platform)}: {c.handle}
                </Pill>
              ))
            ) : (
              <Pill tone="lock">No channels linked</Pill>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}

function Field({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <div className="mb-[3px] font-kolab-mono text-[10px] uppercase text-kolab-muted">{k}</div>
      <div className="text-[14px] font-semibold">{v}</div>
    </div>
  );
}
