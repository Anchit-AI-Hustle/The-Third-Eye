// GET the signed-in creator's Creator Studio for the phone apps: the same rows the website's
// studio, setup, profile and analytics pages read on the server, the views they derive from them,
// and the static reference content, so the apps carry no copy of either. Mutations stay on
// /api/kolab-studio/studio/*, /profile, /channels and /kyc.
import { getEntitlementContext, getMyProfile, getSessionUser } from "@/lib/kolab-studio/db";
import { canUseFeatures, canUsePro, gateReason } from "@/lib/kolab-studio/entitlements";
import { getActiveOrg, getMyMemberships } from "@/lib/kolab-studio/org";
import { PACKS, PACK_META } from "@/lib/kolab-studio/packs";
import { ensureProvisioned } from "@/lib/kolab-studio/provision";
import { getChannels, getDeals, getPillars, getPlan, getSchedule } from "@/lib/kolab-studio/studio";
import { CHANNELS, TIERS } from "@/lib/kolab-studio/content";
import { ageFromDob } from "@/lib/kolab-studio/validation";
import {
  ASSET_META, AUTO_STEPS, BLUEPRINTS, DEFAULT_PILLARS, TK_LABEL, TK_STATUSES,
  assetMix, planToCsv, trackerProgress,
} from "@/lib/kolab-studio/studioHelpers";
import { fail, handleError, ok } from "@/lib/kolab-studio/http";

// The pillar colours are CSS variables on the website (kolab-studio.css).
const HEX: Record<string, string> = {
  "var(--kolab-lime)": "#c2f04a", "var(--kolab-sky)": "#5bc8e8", "var(--kolab-violet)": "#b98cff",
  "var(--kolab-gold)": "#e8b84a", "var(--kolab-clay)": "#e8604a",
};

export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) return fail("Not authenticated", 401);
    const [active, memberships] = await Promise.all([getActiveOrg(), getMyMemberships()]);
    // As the website's studio layout: a creator's first visit provisions them (and grants a
    // privileged account its complimentary plan) before the gate is read.
    if (active?.org.type === "creator") await ensureProvisioned(user);
    const ctx = await getEntitlementContext();
    const unlocked = canUseFeatures(ctx);
    // Profile, identity and channel linking come before the gate, as on the website's setup page.
    const [profile, channels] = await Promise.all([getMyProfile(), getChannels()]);
    const [pillars, plan, deals, schedule] = unlocked
      ? await Promise.all([getPillars(), getPlan(), getDeals(), getSchedule()])
      : [[], [], [], []];
    const like = plan.map((p) => ({ asset_type: p.asset_type, status: p.status, done: p.done }));
    const csv = planToCsv(plan.map((x) => ({
      date: x.date, time: x.time, pillar: pillars.find((p) => p.id === x.pillar_id)?.name ?? "", format: x.format,
      asset_type: x.asset_type, hook: x.hook, status: x.status, done: x.done, notes: x.notes,
    })));
    return ok({
      org: active ? { name: active.org.name, type: active.org.type } : null,
      activeOrgId: active?.org.id ?? null,
      orgs: memberships.map((m) => ({ id: m.org.id, name: m.org.name, type: m.org.type, role: m.role })),
      packs: PACKS.map((t) => {
        const { type, question, label, icon, blurb, verticals } = PACK_META[t];
        return { type, question, label, icon, blurb, verticals };
      }),
      unlocked,
      reason: gateReason(ctx),
      pillars: pillars.map((p) => ({ ...p, color: HEX[p.color ?? ""] ?? p.color })),
      plan, deals, schedule, channels,
      profile: {
        name: profile?.name ?? "", handle: profile?.handle ?? "", dob: profile?.dob ?? "",
        age: profile?.dob ? ageFromDob(profile.dob) : null, pincode: profile?.pincode ?? "",
        city: profile?.city ?? "", state: profile?.state ?? "", country: profile?.country ?? "",
        website_url: profile?.website_url ?? "",
      },
      // As the website's analytics page labels the plan.
      account: {
        kycVerified: ctx.kycVerified, subscriptionActive: ctx.subscriptionActive, privileged: ctx.privileged,
        plan: ctx.privileged ? "Complimentary" : ctx.subscriptionActive ? TIERS[(ctx.plan as "basic" | "pro") ?? "basic"]?.name ?? "Active" : "No plan",
        canPro: canUsePro(ctx),
      },
      analytics: {
        activeDeals: deals.filter((d) => d.active).length,
        linkedChannels: channels.filter((c) => c.handle).length,
        byStatus: TK_STATUSES.map((s) => ({ status: s, label: TK_LABEL[s], n: plan.filter((p) => p.status === s).length })),
      },
      assetMix: assetMix(like),
      tracker: trackerProgress(like),
      csv,
      reference: {
        statuses: TK_STATUSES, statusLabels: TK_LABEL, assetMeta: ASSET_META, channels: CHANNELS,
        blueprints: BLUEPRINTS, autoSteps: AUTO_STEPS, defaultPillars: DEFAULT_PILLARS,
      },
    });
  } catch (e) {
    return handleError(e);
  }
}
