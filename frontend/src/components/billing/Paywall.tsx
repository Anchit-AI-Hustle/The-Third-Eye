"use client";

import { useState } from "react";
import Link from "next/link";
import { X, Lock, Sparkles, Wallet, KeyRound, Check } from "lucide-react";
import { TIERS, type Tier } from "@/lib/billing/plans";
import { useBilling } from "@/lib/billing/useBilling";
import { TierBadge } from "./TierBadge";

// Paywall / recharge popup. Raised either when a feature needs a higher tier
// ("upgrade") or when the wallet can't cover an action ("recharge"). PIN 2803
// unlocks everything for testing without any real payment.
export function Paywall({
  open, onClose, reason = "upgrade", requiredTier = "plus", feature, cost,
}: {
  open: boolean;
  onClose: () => void;
  reason?: "upgrade" | "recharge";
  requiredTier?: Tier;
  feature?: string;
  cost?: number;
}) {
  const { balance, tier, tryUnlock } = useBilling();
  const [pin, setPin] = useState("");
  const [pinErr, setPinErr] = useState(false);
  const [unlocked, setUnlocked] = useState(false);

  if (!open) return null;

  const t = TIERS[requiredTier];
  const submitPin = () => {
    if (tryUnlock(pin)) { setUnlocked(true); setTimeout(onClose, 900); }
    else { setPinErr(true); setTimeout(() => setPinErr(false), 1200); }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4" onClick={onClose}>
      <div
        className="relative w-full max-w-md rounded-2xl border bg-[#0A0F1A] shadow-[0_0_60px_rgba(167,139,250,0.22)]"
        style={{ borderColor: `${t.color}55` }}
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={onClose} className="absolute top-3 right-3 text-text-muted hover:text-text-primary" aria-label="Close">
          <X size={18} />
        </button>

        <div className="p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-11 h-11 rounded-full flex items-center justify-center" style={{ backgroundColor: `${t.color}1A`, border: `1px solid ${t.color}55` }}>
              {reason === "recharge" ? <Wallet size={20} style={{ color: t.color }} /> : <Lock size={20} style={{ color: t.color }} />}
            </div>
            <div>
              <h2 className="font-display text-lg font-semibold text-text-primary flex items-center gap-2">
                {reason === "recharge" ? "Out of credits" : "Premium feature"}
                <TierBadge tier={requiredTier} size="md" />
              </h2>
              <p className="text-text-muted text-xs font-mono">
                {reason === "recharge"
                  ? `You have ${balance} credits${cost ? ` · this needs ${cost}` : ""}`
                  : feature ? `${feature} needs ${t.label}` : `Unlock with ${t.label}`}
              </p>
            </div>
          </div>

          {unlocked ? (
            <div className="flex items-center gap-2 rounded-input border border-[#34D399]/40 bg-[#34D399]/10 px-4 py-3 text-[#34D399] text-sm">
              <Check size={16} /> Test mode unlocked — all paid features are open.
            </div>
          ) : (
            <>
              <ul className="space-y-1.5 mb-4">
                {t.features.slice(0, 4).map((f) => (
                  <li key={f} className="flex items-center gap-2 text-xs text-text-secondary">
                    <Sparkles size={13} style={{ color: t.color }} /> {f}
                  </li>
                ))}
              </ul>

              <div className="flex gap-2 mb-4">
                <Link
                  href="/plans"
                  onClick={onClose}
                  className="flex-1 text-center rounded-input px-4 py-2.5 text-sm font-medium text-black transition-opacity hover:opacity-90"
                  style={{ backgroundColor: t.color }}
                >
                  {reason === "recharge" ? "Buy credits" : `Upgrade to ${t.label}`}
                </Link>
                <Link
                  href="/plans"
                  onClick={onClose}
                  className="rounded-input px-4 py-2.5 text-sm font-medium border border-border-default text-text-secondary hover:text-text-primary"
                >
                  See plans
                </Link>
              </div>

              {/* Test bypass — PIN 2803 (no real payment). */}
              <div className="rounded-input border border-border-default bg-background-secondary/40 p-3">
                <div className="flex items-center gap-1.5 text-[11px] font-mono text-text-muted mb-2">
                  <KeyRound size={12} /> Testing? Enter security PIN to bypass payment
                </div>
                <div className="flex gap-2">
                  <input
                    value={pin}
                    onChange={(e) => setPin(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && submitPin()}
                    type="password"
                    inputMode="numeric"
                    placeholder="••••"
                    className={`flex-1 rounded-input bg-background-primary border px-3 py-2 text-sm font-mono tracking-[0.4em] text-text-primary outline-none ${pinErr ? "border-red-500/70" : "border-border-default focus:border-accent-primary"}`}
                  />
                  <button onClick={submitPin} className="rounded-input px-4 py-2 text-sm font-medium bg-background-secondary border border-border-default text-text-primary hover:border-accent-primary">
                    Unlock
                  </button>
                </div>
                {pinErr && <p className="text-red-400 text-[11px] mt-1.5">Incorrect PIN.</p>}
              </div>

              <p className="text-[10px] text-text-muted font-mono mt-3 text-center">
                Current plan: {TIERS[tier].label} · balance {balance} credits
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
