import type { SeriesPoint } from "@/lib/calculators/types";
import { formatCurrencyCompact } from "@/lib/calculators/format";
import { CHART } from "./theme";

// Area + line: `b` (value over time, accent) against `a` (contributions, muted).
export function GrowthChart({
  series,
  labelA = "You put in",
  labelB = "Value",
}: {
  series: SeriesPoint[];
  labelA?: string;
  labelB?: string;
}) {
  if (!series || series.length < 2) return null;

  const W = 640;
  const H = 280;
  const padL = 6;
  const padR = 6;
  const padT = 14;
  const padB = 26;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const max = Math.max(...series.map((p) => Math.max(p.a, p.b)), 1);
  const n = series.length - 1;
  const x = (i: number) => padL + (i / n) * innerW;
  const y = (v: number) => padT + innerH - (v / max) * innerH;

  const lineB = series.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.b).toFixed(1)}`).join(" ");
  const areaB = `${lineB} L${x(n).toFixed(1)},${(padT + innerH).toFixed(1)} L${x(0).toFixed(1)},${(padT + innerH).toFixed(1)} Z`;
  const lineA = series.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.a).toFixed(1)}`).join(" ");

  const gridY = [0, 0.25, 0.5, 0.75, 1].map((f) => padT + innerH - f * innerH);
  const ticks = Array.from(new Set([0, Math.round(n / 2), n]));

  return (
    <figure className="w-full">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto"
        role="img"
        aria-label={`${labelB} growing from ${series[0].x} to ${series[n].x}`}
      >
        <defs>
          <linearGradient id="growthFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={CHART.blue} stopOpacity="0.35" />
            <stop offset="100%" stopColor={CHART.blue} stopOpacity="0" />
          </linearGradient>
        </defs>
        {gridY.map((gy, i) => (
          <line key={i} x1={padL} y1={gy} x2={W - padR} y2={gy} stroke={CHART.border} strokeWidth="1" />
        ))}
        <path d={areaB} fill="url(#growthFill)" />
        <path d={lineA} fill="none" stroke={CHART.muted} strokeWidth="1.5" strokeDasharray="4 4" />
        <path d={lineB} fill="none" stroke={CHART.blue} strokeWidth="2.5" strokeLinejoin="round" />
        {ticks.map((i) => (
          <text key={i} x={x(i)} y={H - 8} fill={CHART.muted} fontSize="11" textAnchor={i === 0 ? "start" : i === n ? "end" : "middle"}>
            {series[i].x}
          </text>
        ))}
        <text x={padL} y={padT + 4} fill={CHART.muted} fontSize="11">
          {formatCurrencyCompact(max)}
        </text>
      </svg>
      <figcaption className="mt-2 flex flex-wrap gap-4 text-xs text-text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-3 h-0.5" style={{ background: CHART.blue }} /> {labelB}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-3 h-0.5" style={{ background: CHART.muted }} /> {labelA}
        </span>
      </figcaption>
    </figure>
  );
}
