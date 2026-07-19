import type { JobSearchInput, JobSearchResult, NormalizedJob, SourceStatus } from "../types";
import type { JobSourceAdapter } from "./types";
import { JOB_AGENT } from "../config";
import { dedupeJobs } from "../dedupe";
import { remotiveAdapter } from "./remotive";
import { arbeitnowAdapter } from "./arbeitnow";
import { adzunaAdapter } from "./adzuna";
import { linkedinAdapter, indeedAdapter, glassdoorAdapter, upworkAdapter } from "./external";

export const ALL_SOURCES: JobSourceAdapter[] = [
  remotiveAdapter,
  arbeitnowAdapter,
  adzunaAdapter,
  linkedinAdapter,
  indeedAdapter,
  glassdoorAdapter,
  upworkAdapter,
];

export function listSources() {
  return ALL_SOURCES.map((s) => ({
    id: s.id,
    displayName: s.displayName,
    mode: s.mode,
    configured: s.isConfigured(),
  }));
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timed_out")), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

/** Run all selected sources concurrently. One failure never fails the search. */
export async function runSearch(input: JobSearchInput): Promise<JobSearchResult> {
  const wanted = input.sources && input.sources.length ? new Set(input.sources) : null;
  const selected = ALL_SOURCES.filter((s) => (wanted ? wanted.has(s.id) : true));

  const inline = selected.filter((s) => s.mode === "inline");
  const external = selected.filter((s) => s.mode === "external-search");
  const sources: SourceStatus[] = [];

  // External sources are just deep links — no fetch, no ToS risk.
  for (const s of external) {
    sources.push({ id: s.id, displayName: s.displayName, state: "external-search", url: s.buildExternalSearchUrl!(input) });
  }

  const settled = await Promise.allSettled(
    inline.map(async (s) => {
      if (!s.isConfigured()) throw Object.assign(new Error("unconfigured"), { kind: "unconfigured", adapter: s });
      const t0 = Date.now();
      const jobs = await withTimeout(s.search(input), JOB_AGENT.sourceTimeoutMs);
      return { adapter: s, jobs, latencyMs: Date.now() - t0 };
    }),
  );

  let merged: NormalizedJob[] = [];
  settled.forEach((r, i) => {
    const adapter = inline[i];
    if (r.status === "fulfilled") {
      merged = merged.concat(r.value.jobs);
      sources.push({ id: adapter.id, displayName: adapter.displayName, state: "complete", count: r.value.jobs.length, latencyMs: r.value.latencyMs });
    } else {
      const reason = (r.reason as Error)?.message || "unavailable";
      const state = reason === "unconfigured" ? "unconfigured" : reason === "timed_out" ? "timed_out" : "unavailable";
      sources.push({ id: adapter.id, displayName: adapter.displayName, state, message: state === "unavailable" ? reason : undefined });
    }
  });

  return { jobs: dedupeJobs(merged), sources, fetchedAt: new Date().toISOString() };
}
