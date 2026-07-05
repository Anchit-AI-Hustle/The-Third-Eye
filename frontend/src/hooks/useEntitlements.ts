"use client";

import { useCallback, useEffect, useState } from "react";
import { limitsFor, type Tier, type TierLimits } from "@/lib/entitlements";

interface Entitlements {
  tier: Tier;
  limits: TierLimits;
  isPremium: boolean;
  loading: boolean;
  upgrade: (interval: "monthly" | "yearly") => Promise<void>;
  manage: () => Promise<void>;
  refresh: () => void;
}

export function useEntitlements(): Entitlements {
  const [tier, setTier] = useState<Tier>("free");
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let alive = true;
    fetch("/api/billing/me")
      .then((r) => r.json())
      .then((d) => { if (alive) setTier(d.tier ?? "free"); })
      .catch(() => {})
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [nonce]);

  const upgrade = useCallback(async (interval: "monthly" | "yearly") => {
    const res = await fetch("/api/billing/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ interval }),
    });
    const data = await res.json();
    if (data.url) window.location.href = data.url;
    else throw new Error(data.error ?? "Checkout unavailable");
  }, []);

  const manage = useCallback(async () => {
    const res = await fetch("/api/billing/portal", { method: "POST" });
    const data = await res.json();
    if (data.url) window.location.href = data.url;
    else throw new Error(data.error ?? "Billing portal unavailable");
  }, []);

  return {
    tier,
    limits: limitsFor(tier),
    isPremium: tier === "premium",
    loading,
    upgrade,
    manage,
    refresh: () => setNonce((n) => n + 1),
  };
}
