// Fails on high/critical npm advisories: any in production dependencies, and
// any in dev dependencies not already listed in audit-baseline.json (known,
// tracked, waiting on a major upgrade). Run by .github/workflows/npm-audit.yml.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SERIOUS = new Set(["high", "critical"]);

function advisories(report) {
  // An npm/registry failure prints {error} or {message} JSON and exits non-zero;
  // reading that as "no vulnerabilities" would turn an outage into a green run.
  if (!report || report.error || typeof report.vulnerabilities !== "object") {
    throw new Error(`npm audit did not return a report: ${JSON.stringify(report?.error ?? report).slice(0, 300)}`);
  }
  const out = [];
  for (const [pkg, v] of Object.entries(report.vulnerabilities)) {
    for (const a of v.via) {
      if (typeof a === "object" && SERIOUS.has(a.severity)) out.push({ id: a.url.split("/").pop(), severity: a.severity, pkg });
    }
  }
  return out;
}

export function gate(prodReport, fullReport, baseline) {
  const prod = advisories(prodReport);
  const prodIds = new Set(prod.map((a) => a.id));
  const dev = advisories(fullReport).filter((a) => !prodIds.has(a.id));
  const failures = [
    ...prod.map((a) => `production: ${a.id} (${a.severity}) in ${a.pkg}`),
    ...dev.filter((a) => !baseline.includes(a.id)).map((a) => `dev: ${a.id} (${a.severity}) in ${a.pkg}`),
  ];
  const seen = new Set(advisories(fullReport).map((a) => a.id));
  return { failures, stale: baseline.filter((id) => !seen.has(id)) };
}

function audit(args) {
  // npm audit exits non-zero whenever it finds anything; the JSON is what matters.
  try { return JSON.parse(execFileSync("npm", ["audit", "--json", ...args], { encoding: "utf8", maxBuffer: 64 << 20 })); }
  catch (e) { return JSON.parse(e.stdout); }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const baseline = JSON.parse(readFileSync(new URL("../audit-baseline.json", import.meta.url), "utf8")).known.map((k) => k.id);
  const { failures, stale } = gate(audit(["--omit=dev"]), audit([]), baseline);
  for (const id of stale) console.log(`::notice::${id} is no longer reported; remove it from frontend/audit-baseline.json`);
  for (const f of failures) console.log(`::error::New high/critical npm advisory, ${f}`);
  if (failures.length) process.exit(1);
  console.log("npm audit gate: no new high or critical advisories");
}
