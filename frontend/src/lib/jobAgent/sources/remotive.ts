import type { JobSearchInput, NormalizedJob } from "../types";
import type { JobSourceAdapter } from "./types";
import { safeFetchJson } from "../safeFetch";
import { sanitizeHtml, htmlToText } from "../sanitize";
import { canonicalizeUrl, contentHashFor, deriveJobId, parseSalaryText } from "../normalize";

// Remotive public API (https://remotive.com/api/remote-jobs). Free, documented,
// attribution required, remote jobs only. Compliant inline source.
const HOST = "remotive.com";

interface RemotiveJob {
  id: number;
  url: string;
  title: string;
  company_name: string;
  company_logo?: string;
  category?: string;
  job_type?: string;
  candidate_required_location?: string;
  salary?: string;
  description?: string;
  publication_date?: string;
}

export const remotiveAdapter: JobSourceAdapter = {
  id: "remotive",
  displayName: "Remotive",
  mode: "inline",
  attribution: "Remotive (remotive.com)",
  isConfigured: () => true,
  async search(input: JobSearchInput): Promise<NormalizedJob[]> {
    const limit = Math.min(input.limit ?? 25, 50);
    const url = `https://remotive.com/api/remote-jobs?search=${encodeURIComponent(input.query)}&limit=${limit}`;
    const data = await safeFetchJson<{ jobs?: RemotiveJob[] }>(url, { allowHosts: [HOST], timeoutMs: 8000 });
    const fetchedAt = new Date().toISOString();
    return (data.jobs ?? []).slice(0, limit).map((j) => {
      const canonicalUrl = canonicalizeUrl(j.url);
      const descriptionHtml = sanitizeHtml(j.description);
      const descriptionText = htmlToText(j.description);
      const salary = parseSalaryText(j.salary);
      const job: NormalizedJob = {
        id: deriveJobId("remotive", String(j.id), canonicalUrl),
        source: "remotive",
        sourceJobId: String(j.id),
        title: j.title,
        company: j.company_name,
        companyLogoUrl: j.company_logo,
        locationText: j.candidate_required_location || "Remote",
        remoteType: "remote",
        employmentType: j.job_type,
        descriptionHtml,
        descriptionText,
        salaryMin: salary.min,
        salaryMax: salary.max,
        salaryCurrency: salary.currency,
        salaryInterval: salary.interval,
        salaryOriginalText: salary.original,
        publishedAt: j.publication_date,
        applyUrl: j.url,
        canonicalUrl,
        sourceUrl: j.url,
        sourceAttribution: "Remotive (remotive.com)",
        fetchedAt,
        contentHash: "",
        rawMetadata: { category: j.category },
      };
      job.contentHash = contentHashFor(job);
      return job;
    });
  },
  async healthCheck() {
    const t0 = Date.now();
    try {
      await safeFetchJson(`https://remotive.com/api/remote-jobs?limit=1`, { allowHosts: [HOST], timeoutMs: 5000 });
      return { ok: true, latencyMs: Date.now() - t0 };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : "unavailable" };
    }
  },
};
