import type { JobSearchInput } from "../types";
import type { JobSourceAdapter } from "./types";

// External-search adapters for boards whose Terms of Service forbid scraping /
// automated access (LinkedIn, Indeed, Glassdoor, Upwork). We NEVER scrape these
// or automate a logged-in account. Instead we build a compliant live-search
// deep link the user opens themselves. This keeps us on the right side of each
// platform's ToS while still giving one unified search entry point.

function locBit(input: JobSearchInput): string {
  return input.location ? ` ${input.location}` : input.remotePreference === "remote" ? " remote" : "";
}

export const linkedinAdapter: JobSourceAdapter = {
  id: "linkedin",
  displayName: "LinkedIn",
  mode: "external-search",
  attribution: "LinkedIn",
  isConfigured: () => true,
  async search() { return []; },
  buildExternalSearchUrl(input) {
    const params = new URLSearchParams({ keywords: input.query });
    if (input.location) params.set("location", input.location);
    if (input.remotePreference === "remote") params.set("f_WT", "2");
    if (input.datePosted === "day") params.set("f_TPR", "r86400");
    else if (input.datePosted === "week") params.set("f_TPR", "r604800");
    else if (input.datePosted === "month") params.set("f_TPR", "r2592000");
    return `https://www.linkedin.com/jobs/search/?${params.toString()}`;
  },
};

export const indeedAdapter: JobSourceAdapter = {
  id: "indeed",
  displayName: "Indeed",
  mode: "external-search",
  attribution: "Indeed",
  isConfigured: () => true,
  async search() { return []; },
  buildExternalSearchUrl(input) {
    const params = new URLSearchParams({ q: input.query });
    if (input.location) params.set("l", input.location);
    if (input.remotePreference === "remote") params.set("sc", "0kf:attr(DSQF7);");
    if (input.datePosted && input.datePosted !== "any") params.set("fromage", input.datePosted === "day" ? "1" : input.datePosted === "week" ? "7" : "30");
    return `https://www.indeed.com/jobs?${params.toString()}`;
  },
};

export const glassdoorAdapter: JobSourceAdapter = {
  id: "glassdoor",
  displayName: "Glassdoor",
  mode: "external-search",
  attribution: "Glassdoor",
  isConfigured: () => true,
  async search() { return []; },
  buildExternalSearchUrl(input) {
    const q = encodeURIComponent(`${input.query}${locBit(input)}`.trim());
    return `https://www.glassdoor.com/Search/results.htm?keyword=${q}`;
  },
};

export const upworkAdapter: JobSourceAdapter = {
  id: "upwork",
  displayName: "Upwork",
  mode: "external-search",
  attribution: "Upwork",
  isConfigured: () => true,
  async search() { return []; },
  buildExternalSearchUrl(input) {
    return `https://www.upwork.com/nx/search/jobs/?q=${encodeURIComponent(input.query)}`;
  },
};
