import { createHash } from "crypto";
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
const req = (path: string, cookie?: string) => new Request(`${base}${path}`, { headers: { host: "the-third-eye.example.com", ...(cookie ? { cookie } : {}) } });

beforeEach(() => { email = "u@x.com"; saved.clear(); canSave = true; vi.spyOn(console, "error").mockImplementation(() => {}); });
afterEach(() => vi.unstubAllGlobals());

async function begin() {
  const res = await start(req("/api/connect/openrouter"));
  const url = new URL(res.headers.get("location")!);
  const cookie = res.headers.get("set-cookie")!.split(";")[0];
  const [state, verifier] = cookie.slice("or_connect=".length).split(".");
  return { url, cookie, state, verifier };
}

describe("Sign in with OpenRouter", () => {
  it("needs a signed-in user", async () => {
    email = null;
    expect((await start(req("/api/connect/openrouter"))).status).toBe(401);
  });

  it("sends the user to OpenRouter with a PKCE challenge and our callback", async () => {
    const { url, state, verifier } = await begin();
    expect(url.origin + url.pathname).toBe("https://openrouter.ai/auth");
    expect(url.searchParams.get("callback_url")).toBe(`${base}/api/connect/openrouter/callback`);
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).toBe(createHash("sha256").update(verifier).digest("base64url"));
    expect(url.searchParams.get("state")).toBe(state);
  });

  it("exchanges the code for a key on the user's own account and saves it", async () => {
    const { cookie, state, verifier } = await begin();
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ key: "sk-or-v1-own" })));
    vi.stubGlobal("fetch", fetchMock);
    const res = await callback(req(`/api/connect/openrouter/callback?code=abc&state=${state}`, cookie));
    expect(res.headers.get("location")).toBe(`${base}/settings?tab=agent&connect=openrouter_connected`);
    expect(saved.get("openrouter")).toBe("sk-or-v1-own");
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({ code: "abc", code_verifier: verifier, code_challenge_method: "S256" });
  });

  it("refuses a code that doesn't match this browser's sign-in", async () => {
    const { cookie } = await begin();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const res = await callback(req("/api/connect/openrouter/callback?code=abc&state=forged", cookie));
    expect(res.headers.get("location")).toContain("connect=openrouter_error");
    expect((await callback(req("/api/connect/openrouter/callback?code=abc&state=x"))).headers.get("location")).toContain("openrouter_error");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(saved.size).toBe(0);
  });

  it("reports a failed exchange without saving anything", async () => {
    const { cookie, state } = await begin();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("bad", { status: 400 })));
    const res = await callback(req(`/api/connect/openrouter/callback?code=abc&state=${state}`, cookie));
    expect(res.headers.get("location")).toContain("openrouter_error");
    expect(saved.size).toBe(0);
  });

  it("says the key couldn't be saved when the database refuses it", async () => {
    const { cookie, state } = await begin();
    canSave = false;
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ key: "sk-or-v1-own" })));
    const where = new URL((await callback(req(`/api/connect/openrouter/callback?code=abc&state=${state}`, cookie))).headers.get("location")!);
    expect(where.searchParams.get("connect")).toBe("openrouter_error");
    expect(where.searchParams.get("why")).toMatch(/couldn't be saved/);
  });
});
