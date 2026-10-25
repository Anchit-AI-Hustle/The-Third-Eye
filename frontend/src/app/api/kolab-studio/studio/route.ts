// GET the signed-in creator's Creator Studio for the phone apps: the same rows the website's
// studio page reads on the server, the views it derives from them, and the static reference
// content, so the apps carry no copy of either. Mutations stay on /api/kolab-studio/studio/*.
import { getEntitlementContext, getSessionUser } from "@/lib/kolab-studio/db";
import { canUseFeatures, gateReason } from "@/lib/kolab-studio/entitlements";
import { getActiveOrg } from "@/lib/kolab-studio/org";
import { ensureProvisioned } from "@/lib/kolab-studio/provision";
import { getChannels, getDeals, getPillars, getPlan, getSchedule } from "@/lib/kolab-studio/studio";
import { CHANNELS } from "@/lib/kolab-studio/content";
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
    const active = await getActiveOrg();
    // As the website's studio layout: a creator's first visit provisions them (and grants a
    // privileged account its complimentary plan) before the gate is read.
    if (active?.org.type === "creator") await ensureProvisioned(user);
    const ctx = await getEntitlementContext();
    const unlocked = canUseFeatures(ctx);
    const [pillars, plan, deals, schedule, channels] = unlocked
      ? await Promise.all([getPillars(), getPlan(), getDeals(), getSchedule(), getChannels()])
      : [[], [], [], [], []];
    const like = plan.map((p) => ({ asset_type: p.asset_type, status: p.status, done: p.done }));
    const csv = planToCsv(plan.map((x) => ({
      date: x.date, time: x.time, pillar: pillars.find((p) => p.id === x.pillar_id)?.name ?? "", format: x.format,
      asset_type: x.asset_type, hook: x.hook, status: x.status, done: x.done, notes: x.notes,
    })));
    return ok({
      org: active ? { name: active.org.name, type: active.org.type } : null,
      unlocked,
      reason: gateReason(ctx),
      pillars: pillars.map((p) => ({ ...p, color: HEX[p.color ?? ""] ?? p.color })),
      plan, deals, schedule, channels,
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
