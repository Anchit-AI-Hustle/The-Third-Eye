import { beforeEach, describe, expect, it, vi } from "vitest";

let email: string | null = "u@x.com";
vi.mock("next-auth", () => ({ getServerSession: async () => (email ? { user: { email } } : null) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
let stored: Record<string, string> = {};
vi.mock("@/lib/providerKeys", () => ({
  loadOwnKeys: async () => ({ userId: "u", ...stored }),
  saveOwnKey: async (_u: string, p: string, v: string) => { stored[p] = v; return true; },
}));

import { GET, PUT } from "@/app/api/user/paid-consent/route";

const put = (body: unknown) => PUT(new Request("https://x/api/user/paid-consent", { method: "PUT", body: JSON.stringify(body) }));

beforeEach(() => { email = "u@x.com"; stored = {}; });

describe("paid consent", () => {
  it("needs a signed-in user", async () => {
    email = null;
    expect((await GET()).status).toBe(401);
    expect((await put({ provider: "openai", consent: true })).status).toBe(401);
  });
  it("is off until the user turns it on, and a saved key alone is not consent", async () => {
    stored.openai = "sk-own";
    expect(await (await GET()).json()).toEqual({ consent: [] });
  });
  it("refuses consent with no key saved, and unknown providers", async () => {
    expect((await put({ provider: "openai", consent: true })).status).toBe(400);
    expect((await put({ provider: "openrouter", consent: true })).status).toBe(400);
    expect((await put({ provider: "anthropic", consent: true })).status).toBe(400);
  });
  it("covers every user-key provider except ollama, OpenRouter and Anthropic", async () => {
    for (const p of ["groq", "gemini", "mistral", "cerebras", "huggingface"]) {
      stored[p] = "k"; expect((await put({ provider: p, consent: true })).status).toBe(200);
    }
    expect((await put({ provider: "ollama", consent: true })).status).toBe(400);
  });
  it("saves and withdraws consent for that user only", async () => {
    stored.openai = "sk-own";
    expect(await (await put({ provider: "openai", consent: true })).json()).toEqual({ ok: true, consent: ["openai"] });
    expect(await (await GET()).json()).toEqual({ consent: ["openai"] });
    expect(await (await put({ provider: "openai", consent: false })).json()).toEqual({ ok: true, consent: [] });
  });
});
