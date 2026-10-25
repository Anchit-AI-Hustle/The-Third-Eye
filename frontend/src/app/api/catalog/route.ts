import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { STUDIOS, STUDIO_TOOLS, CATEGORY_ORDER, categoryOf } from "@/lib/studioTools";
import { APPS } from "@/lib/apps/registry";
import { CAPS } from "@/lib/capabilities";
import { AUDITS } from "@/lib/audits";
import { SYSTEMS } from "@/lib/systems";
import { ACTIVITY_LABELS, EVENT_PLATFORMS } from "@/lib/health/events";
import { BUNDLES, CREDIT_COSTS, LEVELS, PERIODS, TIERS, TIER_ORDER, priceFor } from "@/lib/billing/plans";

// The website's built-in lists, for the native apps, so their Studio, Apps,
// Capabilities, Online Agents, App Audit, Health and Plans screens stay in step with the site.
export async function GET() {
  if (!(await getServerSession(authOptions))?.user?.email) return Response.json({ error: "Not authenticated" }, { status: 401 });
  return Response.json({
    studios: STUDIOS,
    categoryOrder: CATEGORY_ORDER,
    studioTools: STUDIO_TOOLS.map((t) => ({ ...t, category: categoryOf(t.id) })),
    apps: APPS,
    capabilities: CAPS.map(({ icon: _icon, ...c }) => c),
    systems: SYSTEMS.map(({ id, name, accentColor, purpose, href, kind, lang, gender, pitch, rate, lines }) => ({ id, name, accentColor, purpose, href, kind, lang, gender, pitch, rate, lines: lines.map((l) => l.speech) })),
    audits: AUDITS,
    health: { platforms: EVENT_PLATFORMS, activities: ACTIVITY_LABELS },
    plans: {
      tiers: TIER_ORDER.map((id) => ({ ...TIERS[id], prices: Object.fromEntries(PERIODS.map((p) => [p.id, priceFor(id, p.id)])) })),
      periods: PERIODS,
      bundles: BUNDLES,
      costs: CREDIT_COSTS,
      levels: LEVELS,
    },
  });
}
