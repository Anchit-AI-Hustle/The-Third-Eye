import { describe, it, expect } from "vitest";
import { FORMULAS } from "../formulas";
import { bySlug } from "../data";

// The `calculate` chat tool takes a public slug (e.g. "gst-calculator") and must
// resolve it to a FORMULAS key (e.g. "gst"). This guards that every calculator's
// formula key actually exists in FORMULAS, and that the slugs the tool advertises
// resolve and run.
describe("calculator slug → formula resolution", () => {
  it("every calculator's formula exists in FORMULAS", () => {
    for (const [slug, calc] of Object.entries(bySlug)) {
      expect(typeof FORMULAS[calc.formula], `${slug} → ${calc.formula}`).toBe("function");
    }
  });

  it("the tool's advertised slugs resolve and compute", () => {
    const slugs = ["gst-calculator", "income-tax-calculator", "emi-calculator", "sip-calculator", "fd-calculator"];
    for (const slug of slugs) {
      const key = bySlug[slug]?.formula;
      expect(key, slug).toBeTruthy();
      expect(typeof FORMULAS[key!]).toBe("function");
    }
    // gst-calculator actually runs through the resolved key
    const out = FORMULAS[bySlug["gst-calculator"].formula]({ amount: 10000, rate: 18, mode: 0 });
    expect(out.values.total).toBe(11800);
  });
});
