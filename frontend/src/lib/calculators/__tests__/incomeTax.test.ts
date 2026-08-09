import { describe, it, expect } from "vitest";
import { indiaIncomeTax } from "../formulas";

// FY 2025-26 (AY 2026-27) reference points.
describe("indiaIncomeTax — new regime", () => {
  it("salaried income up to ₹12.75L is fully tax-free (₹75k std + 87A up to ₹12L)", () => {
    const t = indiaIncomeTax(1275000, { regime: "new", salaried: true });
    expect(t.taxable).toBe(1200000);
    expect(t.baseTax).toBe(60000);
    expect(t.rebate).toBe(60000);
    expect(t.totalTax).toBe(0);
  });

  it("applies marginal relief just above the ₹12L rebate ceiling", () => {
    // Gross 13L, std 75k → taxable 12.25L. Slab tax 63,750, but marginal relief
    // caps tax to the ₹25,000 earned above ₹12L, then 4% cess.
    const t = indiaIncomeTax(1300000, { regime: "new", salaried: true });
    expect(t.taxable).toBe(1225000);
    expect(t.incomeTax).toBe(25000);
    expect(t.cess).toBe(1000);
    expect(t.totalTax).toBe(26000);
  });

  it("computes slab tax + 4% cess for ₹20L salaried", () => {
    const t = indiaIncomeTax(2000000, { regime: "new", salaried: true });
    expect(t.taxable).toBe(1925000);
    expect(t.incomeTax).toBe(185000);
    expect(t.surcharge).toBe(0);
    expect(t.cess).toBe(7400);
    expect(t.totalTax).toBe(192400);
  });

  it("adds surcharge above ₹50L", () => {
    const t = indiaIncomeTax(6000000, { regime: "new", salaried: true });
    expect(t.surchargeRate).toBe(0.1);
    expect(t.surcharge).toBeGreaterThan(0);
    expect(t.cess).toBeCloseTo((t.incomeTax + t.surcharge) * 0.04, 2);
  });
});

describe("indiaIncomeTax — old regime", () => {
  it("₹5L taxable is fully rebated (87A up to ₹5L)", () => {
    const t = indiaIncomeTax(550000, { regime: "old", salaried: true });
    expect(t.taxable).toBe(500000);
    expect(t.rebate).toBe(12500);
    expect(t.totalTax).toBe(0);
  });

  it("honors chapter VI-A deductions and old slabs", () => {
    // Gross 10L, std 50k, deductions 1.5L → taxable 8L.
    // 2.5–5L @5% = 12,500; 5–8L @20% = 60,000 → 72,500 + 4% cess.
    const t = indiaIncomeTax(1000000, { regime: "old", salaried: true, deductions: 150000 });
    expect(t.taxable).toBe(800000);
    expect(t.incomeTax).toBe(72500);
    expect(t.totalTax).toBe(75400);
  });
});
