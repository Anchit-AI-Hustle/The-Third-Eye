import { createHash } from "crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let email: string | null = "u@x.com";
vi.mock("next-auth", () => ({ getServerSession: async () => (email ? { user: { email } } : null) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
const saved: { client: string; tokens: Record<string, unknown> }[] = [];
vi.mock("@/lib/providerKeys", () => ({
  HF_SCOPES: "openid inference-api",
  HF_TOKEN_URL: "https://huggingface.co/oauth/token",
  saveHuggingFace: async (_u: string, client: string, tokens: Record<string, unknown>) => { saved.push({ client, tokens }); return typeof tokens.access_token === "string"; },
}));

import { GET as cimd } from "@/app/.well-known/oauth-cimd/route";
import { GET as start } from "@/app/api/connect/huggingface/route";
import { GET as callback } from "@/app/api/connect/huggingface/callback/route";

const base = "https://the-third-eye.example.com";
const req = (path: string, cookie?: string) => new Request(`${base}${path}`, { headers: { host: "the-third-eye.example.com", ...(cookie ? { cookie } : {}) } });

beforeEach(() => { email = "u@x.com"; saved.length = 0; });
afterEach(() => vi.unstubAllGlobals());

async function begin() {
  const res = await start(req("/api/connect/huggingface"));
  const url = new URL(res.headers.get("location")!);
  const cookie = res.headers.get("set-cookie")!.split(";")[0];
  const [state, verifier] = cookie.slice("hf_connect=".length).split(".");
  return { url, cookie, state, verifier };
}

describe("Sign in with Hugging Face", () => {
  it("describes this app to Hugging Face at its own URL, so no app has to be registered by hand", async () => {
    expect(await cimd(req("/.well-known/oauth-cimd")).json()).toMatchObject({
      client_id: `${base}/.well-known/oauth-cimd`,
      redirect_uris: [`${base}/api/connect/huggingface/callback`],
      token_endpoint_auth_method: "none",
      scopes: "openid inference-api",
    });
  });

  it("needs a signed-in user", async () => {
    email = null;
    expect((await start(req("/api/connect/huggingface"))).status).toBe(401);
  });

  it("asks Hugging Face for inference on the user's behalf, with PKCE", async () => {
    const { url, state, verifier } = await begin();
    expect(url.origin + url.pathname).toBe("https://huggingface.co/oauth/authorize");
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      client_id: `${base}/.well-known/oauth-cimd`,
      redirect_uri: `${base}/api/connect/huggingface/callback`,
      response_type: "code",
      scope: "openid inference-api",
      state,
      code_challenge: createHash("sha256").update(verifier).digest("base64url"),
      code_challenge_method: "S256",
    });
  });

  it("exchanges the code for the user's token and saves it", async () => {
    const { cookie, state, verifier } = await begin();
    const fetchMock = vi.fn(async () => Response.json({ access_token: "hf_oauth_own", refresh_token: "r1", expires_in: 28800 }));
    vi.stubGlobal("fetch", fetchMock);
    const res = await callback(req(`/api/connect/huggingface/callback?code=abc&state=${state}`, cookie));
    expect(res.headers.get("location")).toBe(`${base}/settings?tab=agent&connect=huggingface_connected`);
    expect(saved).toEqual([{ client: `${base}/.well-known/oauth-cimd`, tokens: { access_token: "hf_oauth_own", refresh_token: "r1", expires_in: 28800 } }]);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://huggingface.co/oauth/token");
    expect(Object.fromEntries(new URLSearchParams(String(init.body)))).toEqual({
      grant_type: "authorization_code", code: "abc", redirect_uri: `${base}/api/connect/huggingface/callback`,
      client_id: `${base}/.well-known/oauth-cimd`, code_verifier: verifier,
    });
  });

  it("refuses a code that doesn't match this browser's sign-in", async () => {
    const { cookie } = await begin();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect((await callback(req("/api/connect/huggingface/callback?code=abc&state=forged", cookie))).headers.get("location")).toContain("huggingface_error");
    expect((await callback(req("/api/connect/huggingface/callback?code=abc&state=x"))).headers.get("location")).toContain("huggingface_error");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("says why when Hugging Face refuses the code", async () => {
    const { cookie, state } = await begin();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: "invalid_grant", error_description: "Invalid code" }, { status: 400 })));
    const where = new URL((await callback(req(`/api/connect/huggingface/callback?code=abc&state=${state}`, cookie))).headers.get("location")!);
    expect(where.searchParams.get("connect")).toBe("huggingface_error");
    expect(where.searchParams.get("why")).toBe("Hugging Face refused the sign-in (400: Invalid code).");
  });

  it("passes on what Hugging Face said when the user or Hugging Face stops the sign-in", async () => {
    const { cookie, state } = await begin();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const where = new URL((await callback(req(`/api/connect/huggingface/callback?error=access_denied&error_description=User+denied&state=${state}`, cookie))).headers.get("location")!);
    expect(where.searchParams.get("why")).toBe("Hugging Face said: User denied");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
