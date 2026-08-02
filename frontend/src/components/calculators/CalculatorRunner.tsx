"use client";

import { useMemo, useState } from "react";
import type { Calculator, CalcInput, FormulaResult } from "@/lib/calculators/types";
import { FORMULAS } from "@/lib/calculators/formulas";
import { formatOutput, formatCurrency, formatCell } from "@/lib/calculators/format";
import { GrowthChart } from "./charts/GrowthChart";
import { DonutChart } from "./charts/DonutChart";
import { CompareChart } from "./charts/CompareChart";

function initialValues(inputs: CalcInput[]): Record<string, number> {
  const v: Record<string, number> = {};
  for (const i of inputs) v[i.id] = i.default;
  return v;
}

function displayInputValue(input: CalcInput, value: number): string {
  switch (input.type) {
    case "currency":
      return formatCurrency(value);
    case "percent":
      return `${value}%`;
    case "years":
      return value === 1 ? "1 year" : `${value} years`;
    default:
      return new Intl.NumberFormat("en-IN").format(value);
  }
}

function InputControl({
  input,
  value,
  onChange,
}: {
  input: CalcInput;
  value: number;
  onChange: (v: number) => void;
}) {
  if (input.type === "select" && input.options) {
    return (
      <label className="block">
        <span className="text-sm text-text-secondary">{input.label}</span>
        <select
          className="mt-1.5 w-full rounded-input border border-border-default bg-background-base px-3 py-2 text-sm text-text-primary outline-none focus:border-accent-blue"
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
        >
          {input.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
    );
  }

  const min = input.min ?? 0;
  const max = input.max ?? 100;
  const step = input.step ?? 1;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm text-text-secondary">{input.label}</span>
        <span className="font-mono text-sm text-accent-blue tabular-nums">{displayInputValue(input, value)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-2 w-full cursor-pointer"
        style={{ accentColor: "#00D4FF" }}
        aria-label={input.label}
      />
    </div>
  );
}

export function CalculatorRunner({ calculator }: { calculator: Calculator }) {
  const [values, setValues] = useState<Record<string, number>>(() => initialValues(calculator.inputs));

  const result: FormulaResult = useMemo(() => {
    const fn = FORMULAS[calculator.formula];
    if (!fn) return { values: {} };
    try {
      return fn(values);
    } catch {
      return { values: {} };
    }
  }, [calculator.formula, values]);

  const hero = calculator.outputs.find((o) => o.hero) ?? calculator.outputs[0];
  const rest = calculator.outputs.filter((o) => o.id !== hero?.id);

  const set = (id: string, v: number) => setValues((prev) => ({ ...prev, [id]: v }));

  const outValue = (id: string, kind: (typeof calculator.outputs)[number]["kind"]) => {
    const raw = result.values[id];
    return raw === undefined || raw === null ? "—" : formatOutput(raw, kind);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Inputs */}
      <form className="rounded-card border border-border-default bg-background-surface p-5 space-y-5" aria-label={`${calculator.h1} inputs`}>
        {calculator.inputs.map((input) => (
          <InputControl key={input.id} input={input} value={values[input.id]} onChange={(v) => set(input.id, v)} />
        ))}
      </form>

      {/* Results */}
      <div className="rounded-card border border-border-default bg-background-surface p-5">
        {hero && (
          <div className="mb-4">
            <div className="text-xs uppercase tracking-wide text-text-muted">{hero.label}</div>
            <div className="mt-1 font-display text-3xl font-semibold text-accent-blue tabular-nums">
              {outValue(hero.id, hero.kind)}
            </div>
          </div>
        )}

        {rest.length > 0 && (
          <div className="grid grid-cols-2 gap-3 mb-4">
            {rest.map((o) => (
              <div key={o.id} className="rounded-input border border-border-default bg-background-base px-3 py-2.5">
                <div className="text-xs text-text-muted">{o.label}</div>
                <div className={`mt-0.5 font-mono text-sm tabular-nums ${o.accent ? "text-success" : "text-text-primary"}`}>
                  {outValue(o.id, o.kind)}
                </div>
              </div>
            ))}
          </div>
        )}

        {result.note && (
          <p className="mb-4 rounded-input border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
            {result.note}
          </p>
        )}

        {calculator.chart === "growth" && result.series && <GrowthChart series={result.series} />}
        {calculator.chart === "donut" && result.donut && <DonutChart data={result.donut} />}
        {calculator.chart === "compare" && result.compare && <CompareChart data={result.compare} />}

        {result.table && (
          <div className="mt-5 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-default">
                  {result.table.head.map((h, i) => (
                    <th key={i} className="py-2 pr-3 text-left font-medium text-text-muted">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.table.rows.map((row, ri) => (
                  <tr key={ri} className="border-b border-border-default/50">
                    {row.map((cell, ci) => (
                      <td key={ci} className="py-2 pr-3 font-mono tabular-nums text-text-secondary">
                        {formatCell(cell, result.table!.format?.[ci])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
