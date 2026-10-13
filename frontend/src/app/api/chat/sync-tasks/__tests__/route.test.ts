import { beforeEach, describe, expect, it, vi } from "vitest";

let email: string | null = "u@x.com";
vi.mock("next-auth", () => ({ getServerSession: async () => (email ? { user: { email } } : null) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
const sync = vi.fn(async (_e: string, _c: string) => ({ created: 1, updated: 0 }));
vi.mock("@/lib/chatTasks", () => ({ syncChatTasks: (e: string, c: string) => sync(e, c) }));

const post = async (body: unknown) => {
  const { POST } = await import("@/app/api/chat/sync-tasks/route");
  return POST(new Request("https://x.test/api/chat/sync-tasks", { method: "POST", body: JSON.stringify(body) }));
};

beforeEach(() => { vi.resetModules(); sync.mockClear(); email = "u@x.com"; });

describe("POST /api/chat/sync-tasks", () => {
  it("syncs the signed-in user's chat", async () => {
    const r = await post({ chatId: "c1" });
    expect(await r.json()).toEqual({ created: 1, updated: 0 });
    expect(sync).toHaveBeenCalledWith("u@x.com", "c1");
  });

  it("refuses without a session", async () => {
    email = null;
    expect((await post({ chatId: "c1" })).status).toBe(401);
    expect(sync).not.toHaveBeenCalled();
  });

  it("needs a chat id", async () => {
    expect((await post({})).status).toBe(400);
  });

  it("runs a chat at most once per cooldown, so retries and double triggers cost nothing", async () => {
    const { POST } = await import("@/app/api/chat/sync-tasks/route");
    const req = () => new Request("https://x.test", { method: "POST", body: JSON.stringify({ chatId: "c1" }) });
    await POST(req());
    expect(await (await POST(req())).json()).toMatchObject({ skipped: "cooldown" });
    expect(sync).toHaveBeenCalledTimes(1);
  });
});
