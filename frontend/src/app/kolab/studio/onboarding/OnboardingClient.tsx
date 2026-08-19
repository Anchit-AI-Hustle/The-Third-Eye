"use client";
// web/app/onboarding/OnboardingClient.tsx — pick an account type, name the org, create it.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Logo } from "@/components/kolab-studio/Logo";
import { Button, Card, Input, Label } from "@/components/kolab-studio/ui";
import { PACKS, PACK_META, type PackType } from "@/lib/kolab-studio/packs";

export function OnboardingClient({ canGoBack = false }: { canGoBack?: boolean }) {
  const router = useRouter();
  const [type, setType] = useState<PackType | null>(null);
  const [name, setName] = useState("");
  const [vertical, setVertical] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function create() {
    if (!type || !name.trim()) {
      setErr("Pick a type and add a name");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/kolab-studio/org/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, name: name.trim(), vertical: vertical || undefined }),
      });
      const body = await res.json();
      if (!res.ok || !body.ok) throw new Error(body.error || "Could not create");
      router.push("/kolab/studio/home");
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not create");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-[760px] px-[clamp(16px,4vw,30px)] py-8">
      <div className="mb-8 flex items-center justify-between">
        <Logo />
        {canGoBack && (
          <button
            className="font-kolab-mono text-[11px] uppercase tracking-[0.1em] text-kolab-muted hover:text-kolab-ink"
            onClick={() => router.push("/kolab/studio/home")}
          >
            ← Back
          </button>
        )}
      </div>
      <h1 className="mb-2 text-[clamp(26px,5vw,44px)]">What are you here to do?</h1>
      <p className="mb-6 max-w-[52ch] text-[15px] text-kolab-muted">
        This sets up your workspace. You can create more later — each one has its own type.
      </p>

      {err && (
        <div className="mb-4 rounded-lg border border-kolab-clay/40 bg-kolab-clay/10 px-3 py-2.5 font-kolab-mono text-[12px] text-kolab-clay">
          {err}
        </div>
      )}

      <div className="mb-6 grid gap-3 sm:grid-cols-2">
        {PACKS.map((p) => {
          const meta = PACK_META[p];
          const on = type === p;
          return (
            <button key={p} onClick={() => setType(p)} className="text-left">
              <Card className={`h-full p-4 transition-colors ${on ? "border-kolab-lime shadow-[0_0_0_1px_var(--kolab-lime)]" : ""}`}>
                <div className="mb-1.5 text-[24px]">{meta.icon}</div>
                <div className="text-[15px] font-semibold">{meta.question}</div>
                <div className="mt-1 font-kolab-mono text-[10px] uppercase tracking-[0.08em] text-kolab-lime">{meta.label}</div>
                <div className="mt-1.5 text-[13px] text-kolab-muted">{meta.blurb}</div>
              </Card>
            </button>
          );
        })}
      </div>

      {type && (
        <Card className="p-5">
          <div className="grid gap-3.5 sm:grid-cols-2">
            <div>
              <Label>{type === "creator" ? "Your creator / brand name" : type === "agency" ? "Agency name" : "Business name"}</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Aashna Studio" />
            </div>
            <div>
              <Label>Category (optional)</Label>
              <select
                className="w-full rounded-[10px] border border-kolab-line bg-kolab-surface2 px-3 py-[11px] text-[14px] text-kolab-ink"
                value={vertical}
                onChange={(e) => setVertical(e.target.value)}
              >
                <option value="">—</option>
                {PACK_META[type].verticals.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="mt-4">
            <Button variant="primary" disabled={busy} onClick={create}>
              Create workspace →
            </Button>
          </div>
        </Card>
      )}
    </main>
  );
}
