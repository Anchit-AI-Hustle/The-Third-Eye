import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next-auth", () => ({ getServerSession: async () => ({ user: { email: "+919999999999" } }) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
const store = vi.fn();
vi.mock("@/lib/github", () => ({ storeGithubToken: (...a: unknown[]) => store(...a) }));

import { GET } from "@/app/api/connect/github/callback/route";

const call = () => GET(new Request("https://app.example/api/connect/github/callback?code=c&state=s", { headers: { cookie: "gh_connect_state=s" } }));
afterEach(() => { vi.restoreAllMocks(); store.mockReset(); });

describe("GitHub connect callback", () => {
  it("says the token couldn't be saved when GitHub approved but storing fails", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (u) =>
      String(u).includes("access_token") ? Response.json({ access_token: "t" }) : Response.json({ login: "anchit" }));
    store.mockResolvedValue(false);
    expect(new URL((await call()).headers.get("location")!).search).toBe("?connect=github_store_error");
  });

  it("still reports a refused code as a GitHub error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ error: "bad_verification_code" }));
    expect(new URL((await call()).headers.get("location")!).search).toBe("?connect=github_error");
  });
});
