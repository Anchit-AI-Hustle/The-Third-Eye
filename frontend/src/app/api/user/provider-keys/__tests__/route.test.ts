import { beforeEach, describe, expect, it, vi } from "vitest";

let email: string | null = "u@x.com";
vi.mock("next-auth", () => ({ getServerSession: async () => (email ? { user: { email } } : null) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
const saved = new Map<string, string>();
let canSave = true;
vi.mock("@/lib/providerKeys", async (orig) => ({
  ...(await orig<typeof import("@/lib/providerKeys")>()),
  loadOwnKeys: async (userId: string) => ({ userId, ...Object.fromEntries(saved) }),
  saveOwnKey: async (_u: string, p: string, v: string) => { if (canSave) saved.set(p, v); return canSave; },
  deleteOwnKey: async (_u: string, p: string) => { saved.delete(p); },
}));

import { DELETE, GET, PUT } from "@/app/api/user/provider-keys/route";

const put = (body: unknown) => PUT(new Request("https://x.test", { method: "PUT", body: JSON.stringify(body) }) as never);

beforeEach(() => { email = "u@x.com"; saved.clear(); canSave = true; });

describe("own provider keys API", () => {
  it("needs a signed-in user", async () => {
    email = null;
    expect((await GET()).status).toBe(401);
    expect((await put({ provider: "groq", value: "gsk_123456" })).status).toBe(401);
  });

  it("saves a key and never sends it back, only a hint", async () => {
    expect((await put({ provider: "groq", value: "  gsk_secretvalue9876 " })).status).toBe(200);
    expect(saved.get("groq")).toBe("gsk_secretvalue9876");
    const body = await (await GET()).json();
    expect(JSON.stringify(body)).not.toContain("gsk_secretvalue");
    expect(body.keys).toEqual([{ provider: "groq", hint: "…9876" }]);
  });

  it("rejects unknown providers and empty values", async () => {
    expect((await put({ provider: "evil", value: "x".repeat(10) })).status).toBe(400);
    expect((await put({ provider: "groq", value: "  " })).status).toBe(400);
    expect(saved.size).toBe(0);
  });

  it("refuses an Ollama URL on a private network", async () => {
    const r = await put({ provider: "ollama", value: "http://192.168.1.5:11434" });
    expect(r.status).toBe(400);
    expect((await r.json()).error).toMatch(/https/);
    expect((await put({ provider: "ollama", value: "https://mac.example.com" })).status).toBe(200);
    expect((await (await GET()).json()).keys).toEqual([{ provider: "ollama", hint: "mac.example.com" }]);
  });

  it("says so when keys can't be stored, instead of pretending", async () => {
    canSave = false;
    const r = await put({ provider: "groq", value: "gsk_123456" });
    expect(r.status).toBe(503);
  });

  it("removes a key", async () => {
    saved.set("groq", "gsk_x");
    expect((await DELETE(new Request("https://x.test?provider=groq", { method: "DELETE" }) as never)).status).toBe(200);
    expect(saved.has("groq")).toBe(false);
  });
});
