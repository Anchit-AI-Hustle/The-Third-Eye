// web/components/GateBanner.tsx
// Shows WHY features are locked. This is UX only — the actual authorization is enforced
// server-side and by RLS. `reason` comes from lib/entitlements.gateReason() computed on the server.
import Link from "next/link";
import type { EntitlementContext } from "@/lib/kolab-studio/types";
import { gateReason } from "@/lib/kolab-studio/entitlements";

export function GateBanner({ ctx }: { ctx: EntitlementContext }) {
  const reason = gateReason(ctx);
  if (!reason) return null;

  const needKyc = !ctx.kycVerified;
  const needSub = !(ctx.subscriptionActive || ctx.privileged);

  return (
    <div className="mb-6 flex flex-wrap items-center gap-3.5 rounded-xl border border-kolab-gold/35 bg-gradient-to-br from-kolab-clay/[0.14] to-kolab-gold/[0.08] px-[18px] py-4">
      <div className="text-2xl">🔒</div>
      <div className="min-w-[220px] flex-1">
        <b className="mb-0.5 block text-[15px]">{reason}</b>
        <span className="text-[13px] text-kolab-muted">
          You can explore every offering below.{" "}
          {needKyc && "Aadhaar verification is required on every plan. "}
          {needSub && "Pick a plan to activate the tools."}
        </span>
      </div>
      {needKyc && (
        <Link
          href="/kolab/studio/setup"
          className="inline-flex items-center rounded-[9px] border border-kolab-lime bg-kolab-lime px-[18px] py-[11px] font-mono text-[12px] font-bold uppercase tracking-[0.06em] text-kolab-base"
        >
          Verify now
        </Link>
      )}
      {needSub && (
        <Link
          href="/kolab/studio/subscription"
          className="inline-flex items-center rounded-[9px] border border-kolab-line bg-kolab-surface px-[18px] py-[11px] font-mono text-[12px] font-bold uppercase tracking-[0.06em] text-kolab-ink"
        >
          See plans
        </Link>
      )}
    </div>
  );
}
