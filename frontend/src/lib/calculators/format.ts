// Display formatting for calculator outputs. Indian locale (en-IN) with rupee
// grouping, since every calculator is India-personal-finance oriented.

import type { OutputKind } from "./types";

const inr0 = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

const num0 = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

/** Full grouped rupee, no paise: ₹12,34,567 */
export function formatCurrency(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return inr0.format(Math.round(n));
}

/** Compact rupee for tight spaces: ₹12.3L, ₹1.2Cr */
export function formatCurrencyCompact(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1_00_00_000) return `₹${(n / 1_00_00_000).toFixed(2)}Cr`;
  if (abs >= 1_00_000) return `₹${(n / 1_00_000).toFixed(2)}L`;
  if (abs >= 1_000) return `₹${(n / 1_000).toFixed(1)}K`;
  return inr0.format(Math.round(n));
}

export function formatPercent(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return `${n.toFixed(2).replace(/\.00$/, "")}%`;
}

export function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return num0.format(Math.round(n));
}

/** Months → "3 yr 4 mo" (or "8 mo" / "5 yr"). */
export function formatDuration(months: number): string {
  if (!Number.isFinite(months) || months <= 0) return "—";
  const m = Math.round(months);
  const years = Math.floor(m / 12);
  const rem = m % 12;
  if (years === 0) return `${rem} mo`;
  if (rem === 0) return `${years} yr`;
  return `${years} yr ${rem} mo`;
}

export function formatOutput(value: number | string, kind: OutputKind): string {
  if (typeof value === "string") return value;
  switch (kind) {
    case "currency":
      return formatCurrency(value);
    case "percent":
      return formatPercent(value);
    case "duration":
      return formatDuration(value);
    case "number":
      return formatNumber(value);
    case "text":
    default:
      return String(value);
  }
}

/** Formatter for the optional detail table (per-column `format` hints). */
export function formatCell(value: string | number, hint?: string): string {
  if (typeof value === "string") return value;
  if (hint === "currency") return formatCurrency(value);
  if (hint === "percent") return formatPercent(value);
  return formatNumber(value);
}
