"use client";

import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import Link from "next/link";

type Llm = { status: "ok" | "degraded" | "down" };

export function AiStatusBanner() {
  const [llm, setLlm] = useState<Llm | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/health", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => { if (alive) setLlm(d.llm ?? null); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  if (!llm || llm.status === "ok") return null;
  const down = llm.status === "down";
  return (
    <div role="status" className={`mx-3 mt-3 lg:mx-6 flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${down ? "border-accent-red/40 bg-accent-red/10 text-accent-red" : "border-warning/40 bg-warning/10 text-warning"}`}>
      <AlertTriangle size={14} className="shrink-0" />
      <span className="flex-1">
        {down ? "No AI provider can answer right now. Chat will return once one recovers." : "Some AI providers are out of quota or misconfigured, so replies may be slower."}
      </span>
      <Link href="/settings" className="underline underline-offset-2 shrink-0">Providers</Link>
    </div>
  );
}
