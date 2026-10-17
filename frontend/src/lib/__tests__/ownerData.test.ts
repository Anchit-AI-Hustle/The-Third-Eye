import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const cascade = vi.fn(async (_o: { system: string }) => ({ text: '{"is_actionable":false,"summary":"","tasks":[]}' }));
vi.mock("@/lib/llmCascade", () => ({ llmCascade: (o: { system: string }) => cascade(o) }));
vi.mock("next-auth", () => ({ getServerSession: async () => ({ user: { email: "someone@x.com" } }) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

import { extractEmailTasks } from "@/lib/extract";
import { studioSystemPrompt } from "@/lib/studioGenerate";
import { STUDIO_TOOLS } from "@/lib/studioTools";

const mail = { sender: "a@b.com", subject: "Invoice due", receivedAt: "2026-10-17", body: "Please pay by Friday." };

beforeEach(() => { cascade.mockClear(); });
afterEach(() => { vi.unstubAllEnvs(); });

describe("the owner's own data stays with the owner", () => {
  it("reads another user's inbox without assuming they work at Vahdam", async () => {
    await extractEmailTasks({ email: "someone@x.com", ...mail });
    const system = cascade.mock.calls[0][0].system;
    expect(system).not.toMatch(/Vahdam|Anchit/);
    expect(system).toMatch(/actions the user personally has to take/);
  });

  it("keeps the Vahdam-only inbox rules for the accounts in OWNER_EMAILS", async () => {
    vi.stubEnv("OWNER_EMAILS", "Owner@x.com");
    await extractEmailTasks({ email: "owner@x.com", ...mail });
    expect(cascade.mock.calls[0][0].system).toMatch(/Only extract Vahdam work/);
  });

  it("writes Studio assets for the brand in the brief, not the owner's", () => {
    for (const t of STUDIO_TOOLS) expect(studioSystemPrompt(t.id)).not.toMatch(/Vahdam/);
  });

  it("does not show ANCHOR, one operator's release robot, to other accounts", async () => {
    vi.stubEnv("ANCHOR_OPERATORS", "owner@x.com");
    const { GET } = await import("@/app/api/tools/anchor/route");
    const res = await GET();
    expect(res.status).toBe(403);
  });
});
