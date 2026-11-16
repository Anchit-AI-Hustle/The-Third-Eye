import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next-auth", () => ({ getServerSession: async () => ({ user: { email: "u@x.com" } }) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
let grant: { token: string; login: string } | null = { token: "gho_t", login: "anchit" };
vi.mock("@/lib/github", () => ({ getGithubAccessToken: async () => grant }));

import { GET } from "@/app/api/connect/github/status/route";

afterEach(() => { vi.unstubAllGlobals(); grant = { token: "gho_t", login: "anchit" }; });

describe("GitHub connection status", () => {
  it("is connected only while GitHub accepts the saved token", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
    expect(await (await GET()).json()).toMatchObject({ connected: true, expired: false, login: "anchit" });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 401 })));
    expect(await (await GET()).json()).toMatchObject({ connected: false, expired: true });
  });

  it("is not connected without a saved token", async () => {
    grant = null;
    expect(await (await GET()).json()).toMatchObject({ connected: false, expired: false });
  });
});
