import { beforeEach, describe, expect, it, vi } from "vitest";

const cascade = vi.fn();
vi.mock("@/lib/llmCascade", () => ({ llmCascade: (...a: unknown[]) => cascade(...a) }));

beforeEach(() => { cascade.mockReset(); cascade.mockResolvedValue({ text: "# Book", provider: "t" }); });

describe("book outline budget", () => {
  it("grows with the chapters asked for, so a 20-chapter outline isn't cut off", async () => {
    // It had the 2,000-token default, which truncated long outlines mid-plan.
    const { generateStudio } = await import("@/lib/studioGenerate");
    await generateStudio("book", { premise: "p", chapters: "20" });
    await generateStudio("book", { premise: "p", chapters: "8" });
    const [twenty, eight] = cascade.mock.calls.map((c) => c[0].maxTokens);
    expect(twenty).toBeGreaterThanOrEqual(4000);
    expect(eight).toBeLessThan(twenty);
  });
});
