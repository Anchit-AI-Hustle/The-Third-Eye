import { getAdminSupabase } from "@/lib/serverSupabase";
import { limitsFor, isUnlimited, type Tier, type TierLimits } from "@/lib/entitlements";

// Resolve a user's tier from the profiles table. Unknown / unconfigured → free,
// but callers treat "billing not configured" as unlimited (see consume()).
export async function getTier(email: string | undefined): Promise<Tier> {
  if (!email) return "free";
  const sb = getAdminSupabase();
  if (!sb) return "free";
  const { data } = await sb
    .from("profiles")
    .select("subscription_tier, subscription_status")
    .eq("user_id", email)
    .maybeSingle();
  if (data?.subscription_tier === "premium" && data?.subscription_status === "active") {
    return "premium";
  }
  return "free";
}

export interface ConsumeResult {
  allowed: boolean;
  tier: Tier;
  limit: number;
  used: number;
  limits: TierLimits;
}

// Atomically increment a daily counter and decide whether the action is allowed.
// When billing is unconfigured we allow everything (unlimited-free) so the live
// app is never blocked before the operator wires Supabase + Stripe.
export async function consume(
  email: string | undefined,
  metric: keyof Pick<TierLimits, "chatPerDay" | "webSearchPerDay">,
): Promise<ConsumeResult> {
  const sb = getAdminSupabase();
  const tier = await getTier(email);
  const limits = limitsFor(tier);
  const limit = limits[metric] as number;

  if (!sb || !email || isUnlimited(limit)) {
    return { allowed: true, tier, limit, used: 0, limits };
  }

  const metricKey = metric === "chatPerDay" ? "chat" : "web_search";
  const { data, error } = await sb.rpc("increment_usage", {
    p_user_id: email,
    p_metric: metricKey,
    p_amount: 1,
  });
  if (error) return { allowed: true, tier, limit, used: 0, limits }; // fail open

  const used = (data as number) ?? 0;
  return { allowed: used <= limit, tier, limit, used, limits };
}
