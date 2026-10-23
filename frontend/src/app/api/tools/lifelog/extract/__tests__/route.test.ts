import { beforeEach, describe, expect, it, vi } from "vitest";

const cascade = vi.fn();
vi.mock("@/lib/llmCascade", () => ({ llmCascade: (o: unknown) => cascade(o) }));
vi.mock("next-auth", () => ({ getServerSession: async () => ({ user: { email: "u@x.com" } }) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

import { POST } from "@/app/api/tools/lifelog/extract/route";

const post = (transcript: string) => POST(new Request("https://x.test", { method: "POST", body: JSON.stringify({ transcript, date: "2026-10-17" }) }) as never);

beforeEach(() => cascade.mockReset());

describe("Life Log extraction", () => {
  it("fails with an error status when no timeline comes back, so the saved one is kept", async () => {
    cascade.mockResolvedValue({ text: "Sorry, I can't help with that." });
    const res = await post("[09:00] standup with the team about the launch");
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.events).toBeUndefined();
  });

  it("keeps the time each event happened", async () => {
    cascade.mockResolvedValue({ text: '{"events":[{"title":"Standup","kind":"meeting","time":"09:00"}],"summary":"Busy"}' });
    const d = await (await post("[09:00] standup with the team about the launch")).json();
    expect(d.events).toEqual([{ title: "Standup", kind: "meeting", time: "09:00", detail: undefined }]);
  });

  it("reads the whole day, not just its first hours", async () => {
    cascade.mockResolvedValue({ text: '{"events":[],"summary":""}' });
    const lines = Array.from({ length: 600 }, (_, i) => `[${String(8 + Math.floor(i / 60)).padStart(2, "0")}:${String(i % 60).padStart(2, "0")}] ${"talk ".repeat(15)}line ${i}`);
    await post(lines.join("\n"));
    const sent = cascade.mock.calls.map((c) => c[0].messages[0].content).join("\n");
    expect(cascade.mock.calls.length).toBeGreaterThan(1);
    expect(sent).toContain("line 0");
    expect(sent).toContain("line 599");
    for (const c of cascade.mock.calls) expect(c[0].messages[0].content.length).toBeLessThan(12500);
  });
});
