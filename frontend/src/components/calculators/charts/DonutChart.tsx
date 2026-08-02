import type { DonutSlice } from "@/lib/calculators/types";
import { formatCurrency } from "@/lib/calculators/format";
import { DONUT_COLORS } from "./theme";

export function DonutChart({ data }: { data: DonutSlice[] }) {
  const total = data.reduce((s, d) => s + Math.max(d.value, 0), 0);
  if (total <= 0) return null;

  const size = 200;
  const stroke = 30;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const cx = size / 2;
  const cy = size / 2;

  let acc = 0;
  const segments = data.map((d, i) => {
    const value = Math.max(d.value, 0);
    const frac = value / total;
    const len = frac * circumference;
    const offset = acc;
    acc += len;
    return { d, color: DONUT_COLORS[i % DONUT_COLORS.length], len, offset, frac };
  });

  return (
    <figure className="flex flex-col sm:flex-row items-center gap-6">
      <svg viewBox={`0 0 ${size} ${size}`} className="w-40 h-40 shrink-0" role="img" aria-label="Breakdown">
        <g transform={`rotate(-90 ${cx} ${cy})`}>
          {segments.map((s, i) => (
            <circle
              key={i}
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth={stroke}
              strokeDasharray={`${s.len} ${circumference - s.len}`}
              strokeDashoffset={-s.offset}
            />
          ))}
        </g>
      </svg>
      <figcaption className="w-full space-y-2">
        {segments.map((s, i) => (
          <div key={i} className="flex items-center justify-between gap-3 text-sm">
            <span className="inline-flex items-center gap-2 text-text-secondary">
              <span className="inline-block w-3 h-3 rounded-sm" style={{ background: s.color }} />
              {s.d.label}
            </span>
            <span className="font-mono text-text-primary tabular-nums">{formatCurrency(s.d.value)}</span>
          </div>
        ))}
      </figcaption>
    </figure>
  );
}
