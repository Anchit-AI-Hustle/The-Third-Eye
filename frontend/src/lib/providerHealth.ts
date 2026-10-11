import { getDb } from "@/lib/db";

// The AI provider manager's memory. Every instance records what a provider just
// did, so a quota or credit failure seen once benches it everywhere until it can
// recover, and a model found to work is the one every instance starts with.

export type ProviderStatus = "ok" | "rate_limited" | "quota" | "credit" | "error";

export interface ProviderHealth {
  provider: string;
  status: ProviderStatus;
  model: string | null;
  reason: string | null;
  benched_until: string | null;
  checked_at: string;
}

const MINUTE = 60_000;
const TTL_MS = 30_000;
let cache: { at: number; rows: Map<string, ProviderHealth> } | null = null;

/** How long a failure should keep a provider out of rotation, and why. */
export function classifyFailure(status: number, body: string): { status: ProviderStatus; ms: number } | null {
  if (status === 402 || /credit balance|payment required|billing tab|insufficient_quota/i.test(body)) return { status: "credit", ms: 360 * MINUTE };
  if (/exceeded your current quota|per ?day|daily/i.test(body)) return { status: "quota", ms: 60 * MINUTE };
  if (status === 429) return { status: "rate_limited", ms: 2 * MINUTE };
  return null;
}

export async function healthMap(): Promise<Map<string, ProviderHealth>> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.rows;
  const db = getDb();
  if (!db) return new Map();
  const { data } = await db.from("provider_health").select("*");
  const rows = new Map(((data ?? []) as ProviderHealth[]).map((r) => [r.provider, r]));
  cache = { at: Date.now(), rows };
  return rows;
}

/** Why the provider is out of rotation right now, or null if it may be called. */
export async function benchedReason(provider: string): Promise<string | null> {
  const h = (await healthMap()).get(provider);
  if (!h?.benched_until || new Date(h.benched_until).getTime() <= Date.now()) return null;
  return `${h.status.replace("_", " ")} until ${new Date(h.benched_until).toISOString().slice(11, 16)} UTC`;
}

// Background jobs (Gmail scan, device-log sync) run unattended every few
// minutes; if they grab a provider the moment its bench ends they trip it
// again before the user's next chat message, so they wait this much longer.
const BACKGROUND_GRACE_MS = 15 * MINUTE;

/** Like benchedReason, but keeps background work off a provider until well after it recovers. */
export async function backgroundBlocked(provider: string): Promise<string | null> {
  const h = (await healthMap()).get(provider);
  if (!h || h.status === "ok") return null;
  const until = new Date(h.benched_until ?? h.checked_at).getTime() + BACKGROUND_GRACE_MS;
  return until > Date.now() ? `left free for chat after ${h.status.replace("_", " ")}` : null;
}

export async function storedModel(provider: string): Promise<string | null> {
  return (await healthMap()).get(provider)?.model ?? null;
}

async function write(row: Omit<ProviderHealth, "checked_at">) {
  const full = { ...row, checked_at: new Date().toISOString() };
  cache?.rows.set(row.provider, full);
  const db = getDb();
  if (!db) return;
  await db.from("provider_health").upsert(full, { onConflict: "provider" });
}

export async function noteFailure(provider: string, model: string, status: number, body: string) {
  const f = classifyFailure(status, body);
  if (!f) return;
  await write({ provider, status: f.status, model, reason: body.slice(0, 300), benched_until: new Date(Date.now() + f.ms).toISOString() });
}

/** A success clears any bench; only written when something changed, to keep the hot path cheap. */
export async function noteSuccess(provider: string, model: string) {
  const h = (await healthMap()).get(provider);
  if (h && h.status === "ok" && h.model === model && !h.benched_until) return;
  await write({ provider, status: "ok", model, reason: null, benched_until: null });
}

export function resetHealthCache() {
  cache = null;
}
