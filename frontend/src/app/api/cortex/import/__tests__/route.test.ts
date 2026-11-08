import { beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ value: { user: { email: "a@b.c" } } as unknown }));
const remember = vi.hoisted(() => vi.fn(async (_e: string, t: string[]) => t.length));
vi.mock("next-auth", () => ({ getServerSession: async () => session.value }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/cortex", () => ({ cortexEnabled: () => true, rememberBackground: remember }));

import { POST } from "../route";

const post = (body: unknown) => POST(new Request("https://x.test/api/cortex/import", { method: "POST", body: JSON.stringify(body) }) as never);

beforeEach(() => { session.value = { user: { email: "a@b.c" } }; remember.mockClear(); });

describe("/api/cortex/import", () => {
  it("saves the pieces to the signed-in user's memory only", async () => {
    const res = await post({ pieces: ["Topic: x\nI said: hi", 42] });
    expect(await res.json()).toEqual({ saved: 1 });
    expect(remember).toHaveBeenCalledWith("a@b.c", ["Topic: x\nI said: hi"]);
  });

  it("refuses without a sign-in or without pieces", async () => {
    session.value = null;
    expect((await post({ pieces: ["a"] })).status).toBe(401);
    session.value = { user: { email: "a@b.c" } };
    expect((await post({})).status).toBe(400);
  });
});
