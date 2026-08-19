"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card } from "@/components/kolab-studio/ui";
import { TIERS } from "@/lib/kolab-studio/content";
import type { Plan } from "@/lib/kolab-studio/types";

export function PricingTiers({
  privileged,
  currentPlan,
}: {
  privileged: boolean;
  currentPlan: Plan | null;
}) {
  const router = useRouter();
  const [cycle, setCycle] = useState<"monthly" | "annual">("monthly");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function subscribe(plan: "basic" | "pro") {
    setBusy(plan);
    setMsg(null);
    try {
      const res = await fetch("/api/kolab-studio/billing/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, cycle }),
      });
      const body = await res.json();
      if (!res.ok || !body.ok) throw new Error(body.error || "Billing unavailable");
      setMsg(body.data?.message ?? "Plan selected.");
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Billing unavailable");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <div className="mb-5 inline-flex gap-[3px] rounded-full border border-kolab-line bg-kolab-surface p-[3px]">
        {(["monthly", "annual"] as const).map((c) => (
          <button
            key={c}
            onClick={() => setCycle(c)}
            className={`rounded-full px-4 py-2 font-kolab-mono text-[11px] font-bold uppercase ${
              cycle === c ? "bg-kolab-lime text-kolab-base" : "text-kolab-muted"
            }`}
          >
            {c === "monthly" ? "Monthly" : "Annual · save more"}
          </button>
        ))}
      </div>

      <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(300px,1fr))]">
        {(Object.entries(TIERS) as [keyof typeof TIERS, (typeof TIERS)[keyof typeof TIERS]][]).map(
          ([k, t]) => {
            const pm = cycle === "monthly" ? t.monthly : t.annualPM;
            const isCurrent = !privileged && currentPlan === k;
            return (
              <Card
                key={k}
                className={`flex flex-col p-6 ${k === "pro" ? "border-kolab-lime shadow-[0_0_0_1px_var(--kolab-lime)]" : ""}`}
              >
                <h3 className="mb-1 text-[20px]">{t.name}</h3>
                <div className="my-2.5 font-kolab-display text-[38px] font-black">
                  ₹{pm}
                  <span className="text-[14px] font-semibold text-kolab-muted">/mo</span>
                </div>
                <div className="mb-4 text-[12px] text-kolab-lime">
                  {cycle === "monthly" ? "billed monthly" : `₹${t.annualPM * 12}/yr · billed annually`}
                </div>
                <ul className="mb-5 flex-1 list-none">
                  {t.feats.map((feat) => (
                    <li key={feat} className="border-t border-kolab-line py-[7px] pl-[22px] text-[13.5px] text-[#d8d0c6] first:border-t-0 [text-indent:-22px]">
                      <span className="pr-2 font-bold text-kolab-lime">✓</span>
                      {feat}
                    </li>
                  ))}
                </ul>
                <Button
                  variant={k === "pro" ? "primary" : "default"}
                  block
                  disabled={privileged || isCurrent || busy === k}
                  onClick={() => subscribe(k)}
                >
                  {privileged ? "Complimentary access" : isCurrent ? "Current plan" : `Choose ${t.name}`}
                </Button>
              </Card>
            );
          },
        )}
      </div>
      {msg && <p className="mt-4 font-kolab-mono text-[12px] text-kolab-muted">{msg}</p>}
    </div>
  );
}
