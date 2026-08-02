import type { CompareBar } from "@/lib/calculators/types";
import { formatCurrency } from "@/lib/calculators/format";
import { CHART } from "./theme";

export function CompareChart({ data }: { data: CompareBar[] }) {
  const max = Math.max(...data.map((d) => Math.abs(d.value)), 1);

  return (
    <div className="space-y-4" role="img" aria-label="Comparison">
      {data.map((d, i) => {
        const pct = Math.min((Math.abs(d.value) / max) * 100, 100);
        const color = i === 0 ? CHART.muted : CHART.blue;
        return (
          <div key={i}>
            <div className="flex items-baseline justify-between gap-3 mb-1.5">
              <span className="text-sm text-text-secondary">{d.label}</span>
              <span className="font-mono text-sm text-text-primary tabular-nums">{formatCurrency(d.value)}</span>
            </div>
            <div className="h-2.5 rounded-full bg-background-elevated overflow-hidden">
              <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
            </div>
            {d.sub && <div className="mt-1 text-xs text-text-muted">{d.sub}</div>}
          </div>
        );
      })}
    </div>
  );
}
