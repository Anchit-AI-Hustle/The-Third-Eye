import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const cascade = vi.fn();
vi.mock("@/lib/llmCascade", () => ({ llmCascade: (o: unknown) => cascade(o) }));
vi.mock("next-auth", () => ({ getServerSession: async () => ({ user: { email: "u@x.com" } }) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

import { POST } from "@/app/api/finance/parse/route";

const post = (body: Record<string, unknown>) => POST(new Request("https://x.test", { method: "POST", body: JSON.stringify(body) }) as never);

beforeEach(() => {
  cascade.mockReset().mockResolvedValue({ text: '{"amount":250,"category":"Food","note":"lunch","spent_on":"2026-10-17"}' });
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-16T20:30:00Z"));
});
afterEach(() => vi.useRealTimers());

describe("expense parsing", () => {
  it("resolves 'today' to the user's own day", async () => {
    await post({ text: "250 lunch today", timezone: "Asia/Kolkata" });
    expect(cascade.mock.calls[0][0].system).toContain("Today is 2026-10-17.");
  });

  it("uses UTC when the browser sends no zone", async () => {
    await post({ text: "250 lunch today" });
    expect(cascade.mock.calls[0][0].system).toContain("Today is 2026-10-16.");
  });

  describe("when no AI provider answers", () => {
    beforeEach(() => { cascade.mockReset().mockImplementation(async () => { throw new Error("all providers down"); }); });
    const parse = async (text: string) => (await post({ text, timezone: "Asia/Kolkata" })).json();

    it("takes the amount, not the first number", async () => {
      expect(await parse("2 coffees for ₹450")).toMatchObject({ amount: 450 });
      expect(await parse("rent 12,500 for october")).toMatchObject({ amount: 12500 });
      expect(await parse("Rs. 99.50 parking")).toMatchObject({ amount: 99.5 });
    });

    it("resolves yesterday and picks a category from the words", async () => {
      expect(await parse("spent 1200 on groceries yesterday")).toMatchObject({ amount: 1200, category: "Groceries", spent_on: "2026-10-16" });
      expect(await parse("uber 340")).toMatchObject({ category: "Transport", spent_on: "2026-10-17" });
      expect(await parse("electricity bill 2300")).toMatchObject({ category: "Bills" });
    });
  });

  it("reads an answer wrapped in a code fence", async () => {
    cascade.mockReset().mockResolvedValue({ text: '```json\n{"amount":80,"category":"Food","note":"chai","spent_on":"2026-10-17"}\n```' });
    expect(await (await post({ text: "80 chai", timezone: "Asia/Kolkata" })).json()).toMatchObject({ amount: 80, category: "Food" });
  });
});
