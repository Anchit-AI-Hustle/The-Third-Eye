import { describe, it, expect } from "vitest";
import { htmlToText } from "../sanitize";
import { canonicalizeUrl, parseSalaryText, safeFilenamePart, documentFilename, deriveJobId } from "../normalize";
import { isSafeUrl } from "../safeFetch";
import { dedupeJobs } from "../dedupe";
import { scoreMatch } from "../match";
import type { CandidateFact, CareerProfile, NormalizedJob } from "../types";

function job(over: Partial<NormalizedJob>): NormalizedJob {
  return {
    id: over.id || "src:abc", source: over.source || "remotive", title: over.title || "Engineer",
    company: over.company || "Acme", descriptionText: over.descriptionText ?? "We use React and TypeScript.",
    applyUrl: over.applyUrl || "https://x.com/j/1", canonicalUrl: over.canonicalUrl || "https://x.com/j/1",
    sourceUrl: "https://x.com/j/1", sourceAttribution: over.sourceAttribution || "Remotive", fetchedAt: "now",
    contentHash: "h", ...over,
  };
}

describe("htmlToText (untrusted → plain text)", () => {
  it("removes tags and script/style blocks (incl. nested bypass attempts)", () => {
    expect(htmlToText("<p>Hello <b>world</b></p>")).toBe("Hello world");
    const nested = htmlToText("before<scr<script>ipt>alert(1)</script>after");
    expect(nested).not.toMatch(/<script/i);
    expect(nested).toContain("before");
    expect(htmlToText("<style>.x{color:red}</style>visible")).toBe("visible");
  });
  it("decodes entities without double-unescaping", () => {
    // &amp;lt; must decode to the literal "&lt;", NOT to "<".
    expect(htmlToText("a &amp;lt; b")).toBe("a &lt; b");
    expect(htmlToText("Tom &amp; Jerry")).toBe("Tom & Jerry");
  });
});

describe("normalize", () => {
  it("canonicalizes urls (strips utm + trailing slash)", () => {
    expect(canonicalizeUrl("https://x.com/job/1/?utm_source=li&ref=abc")).toBe("https://x.com/job/1");
  });
  it("parses salary text", () => {
    const s = parseSalaryText("$90k - $120k per year");
    expect(s.min).toBe(90000); expect(s.max).toBe(120000); expect(s.currency).toBe("USD"); expect(s.interval).toBe("year");
  });
  it("safe filename strips unsafe chars + path traversal", () => {
    expect(safeFilenamePart("../../etc/passwd")).not.toMatch(/[/.]/);
    expect(documentFilename("Jane Doe", "Acme Inc.", "Sr Eng", "Resume", "pdf")).toMatch(/^Jane_Doe_Acme_Inc_Sr_Eng_Resume\.pdf$/);
  });
  it("derives stable job ids", () => {
    expect(deriveJobId("remotive", "1", "u")).toBe(deriveJobId("remotive", "1", "u"));
  });
});

describe("safeFetch SSRF guard", () => {
  it("blocks http, credentials, and private hosts", () => {
    expect(isSafeUrl("http://x.com").ok).toBe(false);
    expect(isSafeUrl("https://user:pass@x.com").ok).toBe(false);
    expect(isSafeUrl("https://127.0.0.1/x").ok).toBe(false);
    expect(isSafeUrl("https://169.254.169.254/latest").ok).toBe(false);
    expect(isSafeUrl("https://remotive.com/api").ok).toBe(true);
  });
  it("honors host allowlist", () => {
    expect(isSafeUrl("https://evil.com", ["remotive.com"]).ok).toBe(false);
  });
});

describe("dedupe", () => {
  it("collapses duplicate jobs by canonical url", () => {
    const a = job({ id: "remotive:1", applyUrl: "https://x.com/j/1?utm_source=a" });
    const b = job({ id: "arbeitnow:2", source: "arbeitnow", applyUrl: "https://x.com/j/1", descriptionText: "Much longer description ".repeat(20) });
    const out = dedupeJobs([a, b]);
    expect(out.length).toBe(1);
  });
  it("keeps distinct jobs", () => {
    const out = dedupeJobs([job({ id: "a:1", applyUrl: "https://x.com/1", company: "A", title: "X" }), job({ id: "b:2", applyUrl: "https://y.com/2", company: "B", title: "Y" })]);
    expect(out.length).toBe(2);
  });
});

describe("match scoring", () => {
  const facts: CandidateFact[] = [
    { id: "f1", factType: "skill", value: "React", confidence: 1, verified: "verified", sensitivity: "normal", updatedAt: "now" },
    { id: "f2", factType: "skill", value: "TypeScript", confidence: 1, verified: "verified", sensitivity: "normal", updatedAt: "now" },
    { id: "f3", factType: "experience", value: "Built React apps", originalText: "Built React apps in TypeScript", confidence: 1, verified: "verified", sensitivity: "normal", updatedAt: "now" },
  ];
  it("references candidate fact ids in matched requirements", () => {
    const m = scoreMatch(job({}), {}, facts);
    expect(m.overallScore).toBeGreaterThan(0);
    const cited = m.matchedRequirements.flatMap((r) => r.candidateFactIds);
    expect(cited.length).toBeGreaterThan(0);
    for (const id of cited) expect(facts.some((f) => f.id === id)).toBe(true);
  });
  it("applies a hard penalty when sponsorship is required but the posting refuses it", () => {
    const profile: CareerProfile = { needsSponsorship: true };
    const m = scoreMatch(job({ descriptionText: "We are not able to sponsor visas for this role." }), profile, facts);
    expect(m.eligibility).toBe("likely_ineligible");
    expect(m.recommendedAction).toBe("skip");
    expect(m.penaltiesApplied.length).toBeGreaterThan(0);
  });
  it("does not use protected facts", () => {
    const withProtected: CandidateFact[] = [...facts, { id: "p1", factType: "skill", value: "veteran status", confidence: 1, verified: "verified", sensitivity: "protected", updatedAt: "now" }];
    const m = scoreMatch(job({ descriptionText: "veteran status React" }), {}, withProtected);
    const cited = m.matchedRequirements.flatMap((r) => r.candidateFactIds);
    expect(cited).not.toContain("p1");
  });
});
