import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { configuredProviders, probeProviders } from "@/lib/llmCascade";
import { healthMap, resetHealthCache } from "@/lib/providerHealth";

export const runtime = "nodejs";
export const maxDuration = 60;

const PROBE_EVERY_MS = 60_000;
let lastProbe = 0;

async function report() {
  const health = await healthMap();
  const now = Date.now();
  return configuredProviders().map((provider) => {
    const h = health.get(provider);
    const benched = !!h?.benched_until && new Date(h.benched_until).getTime() > now;
    return {
      provider,
      status: benched ? h!.status : h ? "ok" : "unknown",
      model: h?.model ?? null,
      reason: benched ? h!.reason : null,
      benchedUntil: benched ? h!.benched_until : null,
      checkedAt: h?.checked_at ?? null,
    };
  });
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return Response.json({ error: "Not authenticated" }, { status: 401 });
  return Response.json({ providers: await report() }, { headers: { "Cache-Control": "no-store" } });
}

// "Re-check now": a live call to every provider. Throttled because each one
// spends a request from that provider's quota.
export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return Response.json({ error: "Not authenticated" }, { status: 401 });
  if (Date.now() - lastProbe < PROBE_EVERY_MS) return Response.json({ error: "Checked less than a minute ago - try again shortly." }, { status: 429 });
  lastProbe = Date.now();
  await probeProviders();
  resetHealthCache();
  return Response.json({ providers: await report() });
}
