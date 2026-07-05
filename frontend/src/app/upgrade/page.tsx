"use client";

import { useState } from "react";
import { Check, Zap } from "lucide-react";
import { useEntitlements } from "@/hooks/useEntitlements";
import { PRICING } from "@/lib/entitlements";
import { cn } from "@/lib/utils";

const FREE = [
  "20 assistant messages / day",
  "Tasks, notes, goals & knowledge base",
  "Calendar & inbox — read and ask",
  "3 active reminders",
  "Web search & weather",
];

const PREMIUM = [
  "Unlimited assistant messages",
  "JARVIS sends email & schedules events for you",
  "Proactive daily briefing",
  "Unlimited + recurring reminders",
  "Deep multi-agent analysis",
  "Smarter model (Gemini Pro)",
  "Unlimited knowledge documents",
];

export default function UpgradePage() {
  const { isPremium, loading, upgrade, manage } = useEntitlements();
  const [interval, setInterval] = useState<"monthly" | "yearly">("monthly");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function go() {
    setBusy(true); setErr(null);
    try {
      if (isPremium) await manage();
      else await upgrade(interval);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-10">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-semibold text-text-primary">JARVIS Premium</h1>
          <p className="text-text-secondary mt-1">Let JARVIS act for you — not just answer.</p>
        </div>

        <div className="flex items-center justify-center gap-2 mb-8">
          <button onClick={() => setInterval("monthly")}
            className={cn("px-4 py-1.5 rounded-input text-sm border transition-colors",
              interval === "monthly" ? "border-accent-blue text-accent-blue bg-accent-blue/10" : "border-border-default text-text-muted")}>
            Monthly · {PRICING.monthly.label}
          </button>
          <button onClick={() => setInterval("yearly")}
            className={cn("px-4 py-1.5 rounded-input text-sm border transition-colors",
              interval === "yearly" ? "border-accent-blue text-accent-blue bg-accent-blue/10" : "border-border-default text-text-muted")}>
            Yearly · {PRICING.yearly.label} <span className="text-success ml-1">save 37%</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Plan title="Free" price="$0" features={FREE} />
          <Plan title="Premium" price={interval === "yearly" ? PRICING.yearly.label : PRICING.monthly.label}
            features={PREMIUM} highlight />
        </div>

        {err && <p className="text-accent-red text-sm text-center mt-4">{err}</p>}

        <div className="text-center mt-8">
          <button onClick={go} disabled={busy || loading}
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-card bg-accent-blue text-white font-medium text-sm disabled:opacity-60 transition-opacity">
            <Zap size={15} />
            {isPremium ? "Manage subscription" : busy ? "Redirecting…" : `Upgrade — ${interval === "yearly" ? PRICING.yearly.label : PRICING.monthly.label}`}
          </button>
          <p className="text-text-muted text-xs mt-3">Cancel anytime. Secured by Stripe.</p>
        </div>
      </div>
    </div>
  );
}

function Plan({ title, price, features, highlight }: { title: string; price: string; features: string[]; highlight?: boolean }) {
  return (
    <div className={cn("rounded-card border p-5", highlight ? "border-accent-blue/40 bg-accent-blue/5" : "border-border-default bg-background-surface")}>
      <div className="flex items-baseline justify-between mb-4">
        <span className="text-text-primary font-semibold">{title}</span>
        <span className="text-text-primary font-mono">{price}</span>
      </div>
      <ul className="space-y-2">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-sm text-text-secondary">
            <Check size={15} className={cn("flex-none mt-0.5", highlight ? "text-accent-blue" : "text-success")} />
            {f}
          </li>
        ))}
      </ul>
    </div>
  );
}
