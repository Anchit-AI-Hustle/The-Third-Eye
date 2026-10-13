import { describe, expect, it } from "vitest";
import { gate } from "../../../scripts/auditGate.mjs";

const report = (vulns: Record<string, { severity: string; via: unknown[] }>) => ({ vulnerabilities: vulns });
const adv = (id: string, severity: string) => ({ url: `https://github.com/advisories/${id}`, severity, title: `t-${id}` });

describe("npm audit gate", () => {
  it("fails on any high or critical advisory in production dependencies, baseline or not", () => {
    const r = gate(report({ next: { severity: "high", via: [adv("GHSA-aaaa", "high")] } }), report({}), ["GHSA-aaaa"]);
    expect(r.failures).toEqual(["production: GHSA-aaaa (high) in next"]);
  });

  it("fails on a new high or critical dev advisory and passes known ones", () => {
    const dev = report({
      vitest: { severity: "critical", via: [adv("GHSA-known", "critical"), "vite"] },
      vite: { severity: "high", via: [adv("GHSA-new", "high")] },
    });
    expect(gate(report({}), dev, ["GHSA-known"]).failures).toEqual(["dev: GHSA-new (high) in vite"]);
  });

  it("ignores moderate and low advisories", () => {
    const dev = report({ esbuild: { severity: "moderate", via: [adv("GHSA-mod", "moderate")] } });
    expect(gate(report({}), dev, []).failures).toEqual([]);
  });

  it("reports baseline entries that no longer appear so the list shrinks", () => {
    expect(gate(report({}), report({}), ["GHSA-gone"]).stale).toEqual(["GHSA-gone"]);
  });

  it("fails closed when npm audit itself errors instead of reporting", () => {
    expect(() => gate({ error: { code: "ENOAUDIT", summary: "registry unreachable" } }, report({}), [])).toThrow(/npm audit did not return a report/);
    expect(() => gate(report({}), { message: "500" }, [])).toThrow(/npm audit did not return a report/);
  });
});
