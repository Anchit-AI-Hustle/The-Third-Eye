import type { JobSearchInput, NormalizedJob } from "../types";
import type { JobSourceAdapter } from "./types";
import { safeFetchJson } from "../safeFetch";
import { htmlToText } from "../sanitize";
import { canonicalizeUrl, contentHashFor, deriveJobId } from "../normalize";

// Adzuna Jobs API — inline ONLY when ADZUNA_APP_ID + ADZUNA_APP_KEY are set.
// Documented, attribution required. Degrades to unconfigured otherwise.
const HOST = "api.adzuna.com";

interface AdzunaResult {
  id: string;
  redirect_url: string;
  title: string;
  company?: { display_name?: string };
  location?: { display_name?: string };
  description?: string;
  salary_min?: number;
  salary_max?: number;
  contract_time?: string;
  created?: string;
}

export const adzunaAdapter: JobSourceAdapter = {
  id: "adzuna",
  displayName: "Adzuna",
  mode: "inline",
  attribution: "Adzuna (adzuna.com)",
  isConfigured: () => !!(process.env.ADZUNA_APP_ID && process.env.ADZUNA_APP_KEY),
  async search(input: JobSearchInput): Promise<NormalizedJob[]> {
    const appId = process.env.ADZUNA_APP_ID;
    const appKey = process.env.ADZUNA_APP_KEY;
    if (!appId || !appKey) return [];
    const country = (process.env.ADZUNA_COUNTRY || "gb").toLowerCase();
    const limit = Math.min(input.limit ?? 25, 50);
    const params = new URLSearchParams({
      app_id: appId,
      app_key: appKey,
      results_per_page: String(limit),
      what: input.query,
      "content-type": "application/json",
    });
    if (input.location) params.set("where", input.location);
    if (input.salaryMin) params.set("salary_min", String(input.salaryMin));
    const url = `https://api.adzuna.com/v1/api/jobs/${country}/search/${input.page ?? 1}?${params.toString()}`;
    const data = await safeFetchJson<{ results?: AdzunaResult[] }>(url, { allowHosts: [HOST], timeoutMs: 8000 });
    const fetchedAt = new Date().toISOString();
    return (data.results ?? []).slice(0, limit).map((r) => {
      const canonicalUrl = canonicalizeUrl(r.redirect_url);
      const job: NormalizedJob = {
        id: deriveJobId("adzuna", r.id, canonicalUrl),
        source: "adzuna",
        sourceJobId: r.id,
        title: r.title,
        company: r.company?.display_name || "Unknown",
        locationText: r.location?.display_name,
        employmentType: r.contract_time,
        descriptionText: htmlToText(r.description),
        salaryMin: r.salary_min,
        salaryMax: r.salary_max,
        salaryInterval: "year",
        publishedAt: r.created,
        applyUrl: r.redirect_url,
        canonicalUrl,
        sourceUrl: r.redirect_url,
        sourceAttribution: "Adzuna (adzuna.com)",
        fetchedAt,
        contentHash: "",
      };
      job.contentHash = contentHashFor(job);
      return job;
    });
  },
};
