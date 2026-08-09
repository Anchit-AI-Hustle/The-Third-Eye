import { describe, it, expect } from "vitest";
import { FORMULAS, gstBreakup } from "../formulas";

const num = (v: number | string) => v as number;

describe("gstBreakup", () => {
  it("adds GST on top of a pre-tax amount", () => {
    const b = gstBreakup(10000, 18, "add");
    expect(b.base).toBe(10000);
    expect(b.gst).toBeCloseTo(1800, 6);
    expect(b.total).toBeCloseTo(11800, 6);
    expect(b.cgst).toBeCloseTo(900, 6);
    expect(b.sgst).toBeCloseTo(900, 6);
    expect(b.igst).toBeCloseTo(1800, 6);
  });

  it("extracts GST from a tax-inclusive amount (inverse of add)", () => {
    const b = gstBreakup(11800, 18, "remove");
    expect(b.base).toBeCloseTo(10000, 6);
    expect(b.gst).toBeCloseTo(1800, 6);
    expect(b.total).toBeCloseTo(11800, 6);
  });

  it("0% rate leaves the amount untouched with no tax", () => {
    const b = gstBreakup(500, 0, "remove");
    expect(b.gst).toBe(0);
    expect(b.base).toBe(500);
  });

  it("guards negative and non-finite inputs", () => {
    expect(gstBreakup(-100, 18, "add").base).toBe(0);
    expect(gstBreakup(1000, -5, "add").gst).toBe(0);
    expect(gstBreakup(NaN, 18, "add").total).toBe(0);
  });
});

describe("gst formula", () => {
  it("add mode returns base + gst = total", () => {
    const r = FORMULAS.gst({ amount: 10000, rate: 18, mode: 0 });
    expect(r.values.base).toBe(10000);
    expect(r.values.gst).toBe(1800);
    expect(r.values.total).toBe(11800);
    expect(r.values.cgst).toBe(900);
    expect(r.values.sgst).toBe(900);
  });

  it("remove mode backs the tax out of an inclusive price", () => {
    const r = FORMULAS.gst({ amount: 11800, rate: 18, mode: 1 });
    expect(num(r.values.base)).toBe(10000);
    expect(num(r.values.gst)).toBe(1800);
    expect(num(r.values.total)).toBe(11800);
  });

  it("donut slices sum to the total", () => {
    const r = FORMULAS.gst({ amount: 5000, rate: 12, mode: 0 });
    const sum = (r.donut ?? []).reduce((s, d) => s + d.value, 0);
    expect(sum).toBe(num(r.values.total));
  });
});
