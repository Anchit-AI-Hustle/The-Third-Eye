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
});
