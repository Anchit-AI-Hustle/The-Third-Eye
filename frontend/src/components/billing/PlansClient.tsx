"use client";

import { useState } from "react";
import { Check, Sparkles, Wallet, Zap, TrendingUp, KeyRound, ShieldCheck, X } from "lucide-react";
import { useBilling } from "@/lib/billing/useBilling";
import {
  TIERS, TIER_ORDER, PERIODS, BUNDLES, priceFor, pricePer100,
  type BillingPeriod, type Tier,
} from "@/lib/billing/plans";

// The plans / paywall / wallet surface. Test-mode: subscribe & buy simulate the
// purchase (real build swaps in a gateway callback). PIN 2803 unlocks paid
// features without payment.
export function PlansClient() {
  const b = useBilling();
  const [period, setPeriod] = useState<BillingPeriod>("monthly");
  const [pin, setPin] = useState("");
  const [pinMsg, setPinMsg] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2200); };

  const doSubscribe = (tier: Tier) => {
    if (tier === "basic") return;
    b.subscribe(tier, period);
    flash(`Subscribed to ${TIERS[tier].label} (${PERIODS.find((p) => p.id === period)!.label}) — +${TIERS[tier].monthlyCredits.toLocaleString()} credits`);
  };
  const doBuy = (id: string) => {
    const r = b.purchaseBundle(id);
    if (r.ok) flash(`Added ${r.added?.toLocaleString()} credits`);
  };
  const submitPin = () => {
    if (b.tryUnlock(pin)) { setPinMsg("Unlocked — all paid features open (test mode)."); setPin(""); }
    else setPinMsg("Incorrect PIN.");
    setTimeout(() => setPinMsg(null), 2500);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* Wallet + level */}
      <div className="holo-card p-5 flex flex-wrap items-center gap-5 justify-between">
        <div className="flex items-center gap-4">
          <span className="text-4xl leading-none">{b.level.avatar}</span>
          <div>
            <div className="font-display text-lg font-semibold text-text-primary flex items-center gap-2">
              {b.level.name}
              <span className="rounded-full px-2 py-0.5 text-[10px] font-mono font-semibold uppercase tracking-wider"
                style={{ color: TIERS[b.tier].color, backgroundColor: `${TIERS[b.tier].color}1A`, border: `1px solid ${TIERS[b.tier].color}55` }}>
                {TIERS[b.tier].label}
              </span>
              {b.testUnlocked && <span className="text-[10px] font-mono text-[#34D399]">TEST UNLOCK ON</span>}
            </div>
            <div className="text-xs font-mono text-text-muted mt-0.5">
              {b.usage} actions{b.level.next ? ` · ${b.level.next - b.usage} to next level` : " · max level"}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-card border border-accent-primary/40 bg-accent-primary/10 px-4 py-2">
          <Wallet size={18} className="text-accent-primary" />
          <span className="font-display text-2xl font-semibold text-text-primary">{b.balance.toLocaleString()}</span>
          <span className="text-xs font-mono text-text-muted">credits</span>
        </div>
      </div>

      {/* Subscription tiers */}
      <section>
        <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
          <div>
            <span className="hud-label text-accent-primary">// Subscriptions</span>
            <h2 className="font-display text-xl font-semibold text-text-primary">Plans</h2>
            <p className="text-text-muted text-xs font-mono mt-0.5">Personas & higher limits. Cancel anytime.</p>
          </div>
          {/* Period toggle */}
          <div className="flex flex-wrap gap-1 rounded-card border border-border-default bg-background-secondary/60 p-1">
            {PERIODS.map((p) => (
              <button key={p.id} onClick={() => setPeriod(p.id)}
                className={`rounded-input px-3 py-1.5 text-xs font-mono transition-colors ${period === p.id ? "bg-accent-primary text-black font-semibold" : "text-text-secondary hover:text-text-primary"}`}
                title={p.note}>
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {TIER_ORDER.map((id) => {
            const t = TIERS[id];
            const price = priceFor(id, period);
            const active = b.subscription?.status === "active" && b.subscription.tier === id;
            const isBasic = id === "basic";
            return (
              <div key={id} className="holo-card p-5 flex flex-col" style={{ borderColor: id === "pro" ? `${t.color}66` : undefined }}>
                <div className="flex items-center justify-between mb-1">
                  <span className="rounded-full px-2 py-0.5 text-[10px] font-mono font-semibold uppercase tracking-wider"
                    style={{ color: t.color, backgroundColor: `${t.color}1A`, border: `1px solid ${t.color}55` }}>{t.badge}</span>
                  {id === "pro" && <span className="text-[10px] font-mono text-accent-primary flex items-center gap-1"><TrendingUp size={11} /> Popular</span>}
                </div>
                <h3 className="font-display text-lg font-semibold text-text-primary">{t.label}</h3>
                <div className="mt-1 mb-3">
                  {isBasic ? (
                    <span className="font-display text-2xl font-semibold text-text-primary">Free</span>
                  ) : (
                    <>
                      <span className="font-display text-2xl font-semibold text-text-primary">₹{price.toLocaleString()}</span>
                      <span className="text-xs font-mono text-text-muted"> / {PERIODS.find((p) => p.id === period)!.label.toLowerCase()}</span>
                    </>
                  )}
                  <div className="text-[11px] font-mono text-text-muted mt-0.5">{t.monthlyCredits.toLocaleString()} credits / month</div>
                </div>
                <ul className="space-y-1.5 flex-1 mb-4">
                  {t.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-xs text-text-secondary">
                      <Check size={13} className="mt-0.5 flex-shrink-0" style={{ color: t.color }} /> {f}
                    </li>
                  ))}
                </ul>
                <button
                  disabled={isBasic || active}
                  onClick={() => doSubscribe(id)}
                  className="rounded-input px-4 py-2.5 text-sm font-medium transition-opacity disabled:opacity-50 disabled:cursor-default"
                  style={active || isBasic ? { border: "1px solid var(--border-default,#2A2A3A)", color: "#9898B8" } : { backgroundColor: t.color, color: "#000" }}
                >
                  {isBasic ? "Included" : active ? "Current plan" : `Choose ${t.label}`}
                </button>
              </div>
            );
          })}
        </div>
        {period === "annual" && (
          <p className="text-[11px] font-mono text-text-muted mt-2">Annual is billed at the locked-in rate; pay in monthly / 3-monthly installments. Miss an installment before the next bracket and the plan shows unsubscribed until you settle it.</p>
        )}
        {b.subscribed && !b.testUnlocked && (
          <button onClick={b.cancelSubscription} className="text-[11px] font-mono text-text-muted hover:text-red-400 mt-3">Cancel subscription</button>
        )}
      </section>

      {/* Credit bundles — anyone can buy, no subscription needed */}
      <section>
        <span className="hud-label text-accent-primary">// Pay as you go</span>
        <h2 className="font-display text-xl font-semibold text-text-primary">Credit packs</h2>
        <p className="text-text-muted text-xs font-mono mt-0.5 mb-4">One-time top-ups — no subscription required. Bigger packs = cheaper per credit.</p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {BUNDLES.map((bundle) => (
            <div key={bundle.id} className={`holo-card p-4 flex flex-col ${bundle.best ? "ring-1 ring-accent-primary/60" : ""}`}>
              {bundle.best && <span className="text-[10px] font-mono text-accent-primary flex items-center gap-1 mb-1"><Zap size={11} /> Best value</span>}
              <h3 className="font-display text-base font-semibold text-text-primary">{bundle.label}</h3>
              <div className="mt-1">
                <span className="font-display text-xl font-semibold text-text-primary">{bundle.credits.toLocaleString()}</span>
                {bundle.bonus > 0 && <span className="text-xs font-mono text-[#34D399]"> +{bundle.bonus.toLocaleString()}</span>}
              </div>
              <div className="text-[11px] font-mono text-text-muted">₹{pricePer100(bundle)} / 100 cr</div>
              <div className="text-lg font-display font-semibold text-text-primary mt-2 mb-3">₹{bundle.priceInr.toLocaleString()}</div>
              <button onClick={() => doBuy(bundle.id)} className="mt-auto rounded-input px-3 py-2 text-sm font-medium bg-background-secondary border border-border-default text-text-primary hover:border-accent-primary transition-colors">
                Buy
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Test bypass */}
      <section className="holo-card p-5">
        <div className="flex items-center gap-2 mb-2">
          <ShieldCheck size={16} className="text-accent-primary" />
          <h2 className="font-display text-base font-semibold text-text-primary">Testing mode</h2>
        </div>
        <p className="text-text-muted text-xs font-mono mb-3">Enter the security PIN to unlock every paid feature without real payment.</p>
        <div className="flex gap-2 max-w-xs">
          <input value={pin} onChange={(e) => setPin(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submitPin()}
            type="password" inputMode="numeric" placeholder="Security PIN"
            className="flex-1 rounded-input bg-background-primary border border-border-default focus:border-accent-primary px-3 py-2 text-sm font-mono tracking-[0.3em] text-text-primary outline-none" />
          <button onClick={submitPin} className="rounded-input px-4 py-2 text-sm font-medium bg-background-secondary border border-border-default text-text-primary hover:border-accent-primary flex items-center gap-1.5">
            <KeyRound size={14} /> Unlock
          </button>
        </div>
        {pinMsg && <p className={`text-xs font-mono mt-2 ${pinMsg.startsWith("Incorrect") ? "text-red-400" : "text-[#34D399]"}`}>{pinMsg}</p>}
        {b.testUnlocked && (
          <button onClick={b.lock} className="text-[11px] font-mono text-text-muted hover:text-text-primary mt-2 flex items-center gap-1"><X size={11} /> Turn off test unlock</button>
        )}
      </section>

      {/* Recent ledger */}
      {b.ledger.length > 0 && (
        <section>
          <span className="hud-label text-text-muted">// Recent activity</span>
          <div className="holo-card divide-y divide-border-default/50 mt-2">
            {b.ledger.slice(0, 8).map((e, i) => (
              <div key={i} className="flex items-center justify-between px-4 py-2 text-xs font-mono">
                <span className="text-text-secondary">{e.reason}</span>
                <span className="flex items-center gap-3">
                  <span className={e.delta >= 0 ? "text-[#34D399]" : "text-text-muted"}>{e.delta >= 0 ? "+" : ""}{e.delta}</span>
                  <span className="text-text-muted">{e.balance}</span>
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[110] rounded-card border border-accent-primary/50 bg-[#0A0F1A] px-5 py-3 text-sm text-text-primary shadow-[0_0_40px_rgba(79,195,247,0.25)] flex items-center gap-2">
          <Sparkles size={15} className="text-accent-primary" /> {toast}
        </div>
      )}
    </div>
  );
}
