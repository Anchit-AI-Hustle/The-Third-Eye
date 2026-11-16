import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let email: string | null = "u@x.com";
vi.mock("next-auth", () => ({ getServerSession: async () => (email ? { user: { email } } : null) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
const saved = new Map<string, string>();
let canSave = true;
vi.mock("@/lib/providerKeys", () => ({ saveOwnKey: async (_u: string, p: string, v: string) => { if (!canSave) return false; saved.set(p, v); return true; } }));

import { GET as start } from "@/app/api/connect/openrouter/route";
import { GET as callback } from "@/app/api/connect/openrouter/callback/route";


const base = "https://the-third-eye.example.com";
const req = (path: string) => new Request(`${base}${path}`, { headers: { host: "the-third-eye.example.com" } });

beforeEach(() => { email = "u@x.com"; saved.clear(); canSave = true; });
afterEach(() => vi.unstubAllGlobals());

describe("OpenRouter is excluded by the owner", () => {
  it("needs a signed-in user", async () => {
    email = null;
    expect((await start(req("/api/connect/openrouter"))).status).toBe(401);
  });

  it("does not start a sign-in and never contacts OpenRouter", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const res = await start(req("/api/connect/openrouter"));
    expect(res.headers.get("location")).toContain("connect=openrouter_error");
    expect(res.headers.get("location")).not.toContain("openrouter.ai");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("a stray callback saves nothing and calls nothing", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const res = await callback(req("/api/connect/openrouter/callback?code=abc&state=x"));
    expect(res.headers.get("location")).toContain("connect=openrouter_error");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(saved.size).toBe(0);
  });
});
