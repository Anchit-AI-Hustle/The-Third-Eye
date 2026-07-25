import type { JobSearchInput, NormalizedJob } from "../types";

export interface JobSourceHealth {
  ok: boolean;
  latencyMs?: number;
  message?: string;
}

export interface JobSourceAdapter {
  id: string;
  displayName: string;
  /** "inline" fetches results via an official/permitted API; "external-search"
   *  only builds a live-search deep link (for boards whose ToS forbid scraping). */
  mode: "inline" | "external-search";
  /** Attribution string shown on every result from this source. */
  attribution: string;
  isConfigured(): boolean;
  search(input: JobSearchInput): Promise<NormalizedJob[]>;
  buildExternalSearchUrl?(input: JobSearchInput): string;
  healthCheck?(): Promise<JobSourceHealth>;
}
