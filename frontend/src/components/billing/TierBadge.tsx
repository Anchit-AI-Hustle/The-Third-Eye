"use client";

import { TIERS, type Tier } from "@/lib/billing/plans";

// Small tier chip shown next to premium features (Plus / Pro / Max). Basic
// features get no badge. `size="sm"` for inline use next to a label.
export function TierBadge({ tier, size = "sm", className = "" }: { tier: Tier; size?: "sm" | "md"; className?: string }) {
  if (tier === "basic") return null;
  const t = TIERS[tier];
  const pad = size === "sm" ? "px-1.5 py-0.5 text-[9px]" : "px-2 py-0.5 text-[10px]";
  return (
    <span
      className={`inline-flex items-center rounded-full font-mono font-semibold tracking-wider uppercase ${pad} ${className}`}
      style={{ color: t.color, backgroundColor: `${t.color}1A`, border: `1px solid ${t.color}55` }}
      title={`${t.label} feature`}
    >
      {t.badge}
    </span>
  );
}
