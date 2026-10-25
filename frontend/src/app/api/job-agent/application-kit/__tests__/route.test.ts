import { describe, expect, it, vi } from "vitest";

vi.mock("next-auth", () => ({ getServerSession: () => Promise.resolve({ user: { email: "+919999999999" } }) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/credits", () => ({ chargedRoute: (_a: string, h: unknown) => h }));
vi.mock("@/lib/jobAgent/config", () => ({ JOB_AGENT: { enabled: true } }));
const build = vi.fn();
const rows: Record<string, unknown[]> = {
  job_agent_profiles: [{ id: "japrofile_x", user_id: "+919999999999", profile_json: { fullName: "Asha Rao", headline: "Backend" } }],
  candidate_facts: [{ id: "f1", user_id: "+919999999999", fact_type: "skill", value_json: "Go", sensitivity: "normal", verified: "user_confirmed" }],
};
const filters: string[] = [];
vi.mock("@/lib/db", () => ({
  getDb: () => ({
    from: (table: string) => {
      const q = {
        select: () => q,
        eq: (col: string, val: string) => { filters.push(`${table}.${col}=${val}`); return q; },
        limit: () => q,
        then: (r: (v: unknown) => void) => r({ data: rows[table], error: null }),
      };
      return q;
    },
  }),
}));
vi.mock("@/lib/jobAgent/applicationKit", () => ({
  buildApplicationKit: (...a: unknown[]) => { build(...a); return Promise.resolve({
    resume: {
      contact: { fullName: "Asha Rao", email: "asha@example.com" }, templateId: "classic-ats",
      sections: [{ kind: "summary", label: "Summary", visible: true, text: "Builds payment systems." }],
    },
    coverLetter: { greeting: "Dear Hiring Team,", paragraphs: [{ text: "I build payment systems." }], closing: "Regards,", signature: "Asha Rao" },
    match: { overallScore: 82 }, screeningAnswers: [], warnings: [], needsInformation: [],
  }); },
}));

const job = { id: "j1", title: "Backend Engineer", company: "Acme Pay", applyUrl: "https://acme.example/jobs/1" };

describe("/api/job-agent/application-kit", () => {
  it("returns the documents ready to show and share, for the phone apps", async () => {
    const { POST } = await import("@/app/api/job-agent/application-kit/route");
    const res = await POST(new Request("https://x.test/api/job-agent/application-kit", {
      method: "POST", body: JSON.stringify({ job, profile: { fullName: "Asha Rao" }, facts: [] }),
    }) as never);
    const { kit, documents } = await res.json();
    expect(kit.match.overallScore).toBe(82);
    expect(documents.resumeHtml).toContain("<h1>Asha Rao</h1>");
    expect(documents.resumeHtml).toMatch(/^<!doctype html>/);
    expect(documents.resumeMarkdown).toContain("## Summary");
    expect(documents.coverText).toBe("Dear Hiring Team,\n\nI build payment systems.\n\nRegards,\nAsha Rao");
    expect(documents.coverHtml).toContain("I build payment systems.");
    expect(documents.resumeName).toBe("Asha_Rao_Acme_Pay_Backend_Engineer_Resume");
    expect(documents.coverName).toBe("Asha_Rao_Acme_Pay_Backend_Engineer_Cover_Letter");
  });
  it("builds from the caller's own saved profile and facts when the app asks", async () => {
    const { POST } = await import("@/app/api/job-agent/application-kit/route");
    const res = await POST(new Request("https://x.test/api/job-agent/application-kit", {
      method: "POST", body: JSON.stringify({ job, useSaved: true, profile: { fullName: "Someone Else" }, facts: [{ id: "x" }] }),
    }) as never);
    expect(res.status).toBe(200);
    const input = build.mock.calls.at(-1)![0];
    expect(input.profile).toEqual({ fullName: "Asha Rao", headline: "Backend" });
    expect(input.facts).toEqual([{ id: "f1", factType: "skill", value: "Go", sensitivity: "normal", verified: "user_confirmed", confidence: undefined }]);
    expect(filters).toContain("job_agent_profiles.user_id=+919999999999");
    expect(filters).toContain("candidate_facts.user_id=+919999999999");
  });
});
