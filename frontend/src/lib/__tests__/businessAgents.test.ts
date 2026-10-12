import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const cascade = vi.fn();
vi.mock("@/lib/llmCascade", () => ({ llmCascade: (o: unknown) => cascade(o) }));
const resolved: Record<string, string[]> = { "acme.com": ["93.184.216.34"], "intranet.example": ["10.0.0.5"] };
vi.mock("dns/promises", () => {
  const lookup = async (h: string) => (resolved[h] ?? []).map((address) => ({ address }));
  return { lookup, default: { lookup } };
});

import { parseCsv, profileCsv, readPage, runBusinessAgent } from "@/lib/businessAgents";

const deps = { search: vi.fn(async (q: string) => `• **Result for ${q}**\n  snippet\n  https://acme.com/about`), news: vi.fn(async () => "- **Acme raises $5M**") };

beforeEach(() => {
  cascade.mockReset().mockResolvedValue({ text: "REPORT" });
  deps.search.mockClear();
  deps.news.mockClear();
  vi.stubGlobal("fetch", vi.fn(async () => new Response("<html><title>Acme</title><h1>We sell widgets</h1><p>Widgets from $9</p></html>", { headers: { "content-type": "text/html" } })));
});
afterEach(() => vi.unstubAllGlobals());

describe("CSV handling for data analysis", () => {
  it("parses quoted cells and computes totals itself", () => {
    expect(parseCsv('a,b\n"x, y",2\n')).toEqual([["a", "b"], ["x, y", "2"]]);
    const profile = profileCsv("product,revenue\nA,100\nB,250\nA,50\n")!;
    expect(profile).toContain("3 rows × 2 columns");
    expect(profile).toContain("revenue (number): sum 400, mean 133.33, min 50, max 250");
    expect(profile).toContain("product (text, 2 distinct): A (2), B (1)");
  });

  it("hands the model the computed profile, not just raw rows", async () => {
    await runBusinessAgent({ kind: "data_analysis", goal: "top products", document: "product,revenue\nA,100\nB,250\n" }, deps);
    expect(cascade.mock.calls[0][0].messages[0].content).toContain("COMPUTED COLUMN PROFILE");
  });
});

describe("running an agent", () => {
  it("asks for what it needs instead of guessing", async () => {
    expect(await runBusinessAgent({ kind: "contract_review" }, deps)).toMatch(/Attach the file/);
    expect(await runBusinessAgent({ kind: "seo_audit" }, deps)).toMatch(/URL/);
    expect(cascade).not.toHaveBeenCalled();
  });

  it("gathers searches, news and the result pages before writing the brief", async () => {
    const out = await runBusinessAgent({ kind: "meeting_prep", subject: "Acme", goal: "close a pilot", details: "CEO + CTO, 30 min" }, deps);
    expect(out).toBe("**Meeting preparation**\n\nREPORT");
    expect(deps.search).toHaveBeenCalledTimes(2);
    expect(deps.news).toHaveBeenCalledWith("Acme");
    const { system, messages } = cascade.mock.calls[0][0];
    expect(system).toMatch(/agenda/);
    expect(messages[0].content).toContain("Goal: close a pilot");
    expect(messages[0].content).toContain("## Page: https://acme.com/about");
    expect(messages[0].content).toContain("We sell widgets");
  });

  it("skips sign-in pages when choosing which results to read", async () => {
    const search = vi.fn(async () => "• **Acme login**\n  https://dashboard.acme.com/login\n\n• **Acme**\n  https://acme.com/about");
    await runBusinessAgent({ kind: "competitor_intel", subject: "Acme" }, { ...deps, search });
    const evidence = cascade.mock.calls[0][0].messages[0].content;
    expect(evidence).toContain("## Page: https://acme.com/about");
    expect(evidence).not.toContain("## Page: https://dashboard.acme.com/login");
  });

  it("refuses to read pages on private networks", async () => {
    expect(await readPage("http://intranet.example/admin")).toBe("");
    expect(await readPage("http://localhost:3000")).toBe("");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not follow a redirect into a private network", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: "http://intranet.example/" } }));
    expect(await readPage("https://acme.com/")).toBe("");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("feeds the money coach the user's recorded expenses", async () => {
    await runBusinessAgent({ kind: "financial_coach", subject: "my spending" }, { ...deps, appData: "2026-10-01 Food 450" });
    expect(cascade.mock.calls[0][0].messages[0].content).toContain("2026-10-01 Food 450");
  });
});
