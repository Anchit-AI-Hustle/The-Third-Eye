// Shared types for the /calculators section.
//
// Ported from moneymint's data-driven design: every calculator is one object
// (see ./data.ts) whose `formula` key points at a pure function in ./formulas.ts.
// The formula returns a small, chart-agnostic result shape that the UI renders.

export type InputType = "currency" | "percent" | "years" | "number" | "select";

export interface SelectOption {
  value: number;
  label: string;
}

export interface CalcInput {
  id: string;
  label: string;
  type: InputType;
  default: number;
  min?: number;
  max?: number;
  step?: number;
  options?: SelectOption[];
}

export type OutputKind = "currency" | "percent" | "duration" | "number" | "text";

export interface CalcOutput {
  id: string;
  label: string;
  kind: OutputKind;
  hero?: boolean;
  accent?: boolean;
}

export interface Faq {
  q: string;
  a: string;
}

export type ChartType = "growth" | "donut" | "compare";

export interface Calculator {
  slug: string;
  category: string;
  h1: string;
  metaTitle: string;
  metaDescription: string;
  keywords: string[];
  formula: string;
  chart?: ChartType;
  table?: string;
  offerTags?: string[];
  inputs: CalcInput[];
  outputs: CalcOutput[];
  intro: string;
  howItWorks: string[];
  faqs: Faq[];
  related: string[];
}

// ─── Formula result contract ──────────────────────────────────────────────
export interface SeriesPoint {
  x: string;
  a: number;
  b: number;
}
export interface DonutSlice {
  label: string;
  value: number;
}
export interface CompareBar {
  label: string;
  value: number;
  sub?: string;
}
export interface ResultTable {
  head: string[];
  rows: Array<Array<string | number>>;
  format?: string[];
}
export interface FormulaResult {
  values: Record<string, number | string>;
  series?: SeriesPoint[];
  donut?: DonutSlice[];
  compare?: CompareBar[];
  table?: ResultTable;
  note?: string;
}

// Inputs arrive from the UI as numbers (currency/percent/years/number/select).
export type FormulaInputs = Record<string, number>;
export type FormulaFn = (v: FormulaInputs) => FormulaResult;
