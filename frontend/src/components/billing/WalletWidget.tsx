"use client";

import Link from "next/link";
import { Wallet } from "lucide-react";
import { useBilling } from "@/lib/billing/useBilling";
import { TIERS } from "@/lib/billing/plans";

// Compact wallet + level chip. Shows the user's avatar/level, credit balance,
// and effective tier; links to /plans. Drop into headers / dashboards.
export function WalletWidget({ compact = false }: { compact?: boolean }) {
  const { ready, balance, tier, level, usage } = useBilling();
  if (!ready) return null;

  const t = TIERS[tier];
  const pct = level.next ? Math.min(100, Math.round((usage / level.next) * 100)) : 100;

  return (
    <Link
      href="/plans"
      className="group inline-flex items-center gap-2.5 rounded-card border border-border-default bg-background-secondary/60 px-3 py-1.5 hover:border-accent-primary/60 transition-colors"
      title={`${level.name} · ${TIERS[tier].label} plan`}
    >
      <span className="text-lg leading-none">{level.avatar}</span>
      {!compact && (
        <span className="flex flex-col">
          <span className="text-[11px] font-mono text-text-secondary leading-tight">{level.name}</span>
          <span className="w-16 h-1 rounded-full bg-background-primary overflow-hidden mt-0.5">
            <span className="block h-full rounded-full bg-accent-primary" style={{ width: `${pct}%` }} />
          </span>
        </span>
      )}
      <span className="flex items-center gap-1 text-xs font-mono font-semibold text-text-primary">
        <Wallet size={13} className="text-accent-primary" /> {balance.toLocaleString()}
      </span>
      <span
        className="rounded-full px-1.5 py-0.5 text-[9px] font-mono font-semibold uppercase tracking-wider"
        style={{ color: t.color, backgroundColor: `${t.color}1A`, border: `1px solid ${t.color}55` }}
      >
        {t.badge}
      </span>
    </Link>
  );
}
