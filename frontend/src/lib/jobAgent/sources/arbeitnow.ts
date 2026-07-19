import type { JobSearchInput, NormalizedJob } from "../types";
import type { JobSourceAdapter } from "./types";
import { safeFetchJson } from "../safeFetch";
import { htmlToText } from "../sanitize";
import { canonicalizeUrl, contentHashFor, deriveJobId } from "../normalize";

// Arbeitnow public Job Board API (https://www.arbeitnow.com/api/job-board-api).
// Free, documented, attribution required. The endpoint returns a page of recent
// postings; it has no server-side search, so we filter by the query client-side.
const HOST = "www.arbeitnow.com";

interface ArbeitnowJob {
  slug: string;
  company_name: string;
  title: string;
  description?: string;
  remote?: boolean;
  url: string;
  tags?: string[];
  job_types?: string[];
  location?: string;
  created_at?: number; // unix seconds
}

function matches(j: ArbeitnowJob, q: string): boolean {
  if (!q) return true;
  const hay = `${j.title} ${j.company_name} ${(j.tags || []).join(" ")} ${j.description ?? ""}`.toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .some((term) => hay.includes(term));
}

export const arbeitnowAdapter: JobSourceAdapter = {
  id: "arbeitnow",
  displayName: "Arbeitnow",
  mode: "inline",
  attribution: "Arbeitnow (arbeitnow.com)",
  isConfigured: () => true,
  async search(input: JobSearchInput): Promise<NormalizedJob[]> {
    const limit = Math.min(input.limit ?? 25, 50);
    const data = await safeFetchJson<{ data?: ArbeitnowJob[] }>(
      "https://www.arbeitnow.com/api/job-board-api",
      { allowHosts: [HOST], timeoutMs: 8000 },
    );
    const fetchedAt = new Date().toISOString();
    return (data.data ?? [])
      .filter((j) => matches(j, input.query))
      .slice(0, limit)
      .map((j) => {
        const canonicalUrl = canonicalizeUrl(j.url);
        const job: NormalizedJob = {
          id: deriveJobId("arbeitnow", j.slug, canonicalUrl),
          source: "arbeitnow",
          sourceJobId: j.slug,
          title: j.title,
          company: j.company_name,
          locationText: j.location || (j.remote ? "Remote" : undefined),
          remoteType: j.remote ? "remote" : undefined,
          employmentType: (j.job_types || [])[0],
          skills: j.tags,
          descriptionText: htmlToText(j.description),
          publishedAt: j.created_at ? new Date(j.created_at * 1000).toISOString() : undefined,
          applyUrl: j.url,
          canonicalUrl,
          sourceUrl: j.url,
          sourceAttribution: "Arbeitnow (arbeitnow.com)",
          fetchedAt,
          contentHash: "",
          rawMetadata: { tags: j.tags },
        };
        job.contentHash = contentHashFor(job);
        return job;
      });
  },
  async healthCheck() {
    const t0 = Date.now();
    try {
      await safeFetchJson("https://www.arbeitnow.com/api/job-board-api", { allowHosts: [HOST], timeoutMs: 5000 });
      return { ok: true, latencyMs: Date.now() - t0 };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : "unavailable" };
    }
  },
};
