"use client";

import { TrendingUp, Lock, Zap, Shield, CreditCard, BarChart3 } from "lucide-react";

export function FinanceClient() {
  return (
    <div className="holo-card rounded-card p-8 hud-frame text-center">
      <div className="flex flex-col items-center justify-center py-8">
        <div className="arc-reactor arc-reactor-lg mb-6">
          <div className="arc-reactor-ring3" />
          <div className="arc-reactor-core" />
        </div>

        <h2 className="gradient-text-arc text-lg font-display font-semibold mb-2">
          Financial Intelligence Module
        </h2>
        <p className="text-text-muted text-sm max-w-md mb-8">
          Connect accounts, track spending, and let your AI surface financial insights automatically.
          Currently in development — Phase 3.
        </p>

        {/* Planned features */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-lg mb-8">
          <FeatureCard icon={<CreditCard size={14} />} label="Account Linking" sub="Bank & card sync" />
          <FeatureCard icon={<BarChart3 size={14} />} label="Spend Analytics" sub="Category breakdown" />
          <FeatureCard icon={<TrendingUp size={14} />} label="Investment Tracking" sub="Portfolio overview" />
          <FeatureCard icon={<Zap size={14} />} label="AI Insights" sub="Anomaly detection" />
          <FeatureCard icon={<Shield size={14} />} label="Encrypted Storage" sub="AES-128 on amounts" />
          <FeatureCard icon={<Lock size={14} />} label="TOTP Gated" sub="Level 4 security" />
        </div>

        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-warning animate-pulse" />
          <span className="hud-label text-warning">Phase 3 · In Development</span>
        </div>
      </div>
    </div>
  );
}

function FeatureCard({ icon, label, sub }: { icon: React.ReactNode; label: string; sub: string }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-card border border-border-default bg-background-surface/50 text-left">
      <span className="text-[#4FC3F7]/50">{icon}</span>
      <div>
        <p className="text-sm text-text-secondary">{label}</p>
        <p className="text-[10px] text-text-muted font-mono">{sub}</p>
      </div>
    </div>
  );
}
