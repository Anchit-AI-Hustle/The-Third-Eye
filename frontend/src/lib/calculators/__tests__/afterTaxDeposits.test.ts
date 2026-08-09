import { describe, it, expect } from "vitest";
import { FORMULAS } from "../formulas";

const num = (v: number | string) => v as number;

describe("FD after-tax", () => {
  it("no tax → after-tax equals pre-tax", () => {
    const r = FORMULAS.fd({ principal: 500000, rate: 7, years: 5, frequency: 4, inflation: 6, taxSlab: 0 });
    expect(r.values.afterTaxMaturity).toBe(r.values.maturity);
    expect(r.values.taxOnInterest).toBe(0);
  });

  it("30% slab taxes interest at slab + 4% cess (31.2%)", () => {
    const r = FORMULAS.fd({ principal: 500000, rate: 7, years: 5, frequency: 4, inflation: 6, taxSlab: 30 });
    const interest = num(r.values.interest);
    expect(num(r.values.taxOnInterest)).toBeCloseTo(interest * 0.312, 4);
    expect(num(r.values.afterTaxInterest)).toBeCloseTo(interest * (1 - 0.312), 4);
    expect(num(r.values.afterTaxMaturity)).toBeCloseTo(500000 + interest * (1 - 0.312), 4);
    expect(num(r.values.afterTaxMaturity)).toBeLessThan(num(r.values.maturity));
  });
});

describe("RD after-tax", () => {
  it("30% slab reduces maturity by tax on interest only", () => {
    const r = FORMULAS.rd({ monthly: 5000, rate: 7, years: 5, taxSlab: 30 });
    const interest = num(r.values.interest);
    const invested = num(r.values.invested);
    expect(num(r.values.taxOnInterest)).toBeCloseTo(interest * 0.312, 4);
    expect(num(r.values.afterTaxMaturity)).toBeCloseTo(invested + interest * (1 - 0.312), 4);
  });
});
