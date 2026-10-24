import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let email: string | null = "u@x.com";
vi.mock("next-auth", () => ({ getServerSession: async () => (email ? { user: { email } } : null) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
const saved = new Map<string, string>();
vi.mock("@/lib/providerKeys", async (orig) => ({
  ...(await orig<typeof import("@/lib/providerKeys")>()),
  loadOwnKeys: async (userId: string) => ({ userId, ...Object.fromEntries(saved) }),
  saveOwnKey: async (_u: string, p: string, v: string) => { saved.set(p, v); return true; },
  deleteOwnKey: async (_u: string, p: string) => { saved.delete(p); },
}));

import { GET, POST, PUT } from "@/app/api/user/local-model/route";

const put = (body: unknown) => PUT(new Request("https://x.test", { method: "PUT", body: JSON.stringify(body) }));

beforeEach(() => { email = "u@x.com"; saved.clear(); });
afterEach(() => vi.unstubAllGlobals());

describe("local model settings", () => {
  it("needs a signed-in user", async () => {
    email = null;
    expect((await GET()).status).toBe(401);
    expect((await put({ localFirst: false })).status).toBe(401);
    expect((await POST()).status).toBe(401);
  });

  it("answers first by default once a computer is connected, and can be turned off and on", async () => {
    expect((await (await GET()).json()).localFirst).toBe(false);
    saved.set("ollama", "https://mac.example.com");
    expect(await (await GET()).json()).toMatchObject({ connected: true, host: "mac.example.com", localFirst: true, hasToken: false });
    await put({ localFirst: false });
    expect(saved.get("local_first")).toBe("off");
    expect((await (await GET()).json()).localFirst).toBe(false);
    await put({ localFirst: true });
    expect(saved.has("local_first")).toBe(false);
  });

  it("saves a model and per-assistant models, and rejects anything that isn't a model name", async () => {
    expect((await put({ model: "qwen2.5:14b", assistantModels: { friday: "llama3.2:3b", jarvis: " " } })).status).toBe(200);
    expect(saved.get("ollama_model")).toBe("qwen2.5:14b");
    expect(JSON.parse(saved.get("ollama_models")!)).toEqual({ friday: "llama3.2:3b" });
    expect((await put({ model: "rm -rf /" })).status).toBe(400);
    expect((await put({ assistantModels: { "bad key": "x" } })).status).toBe(400);
    expect((await put({ model: "" })).status).toBe(200);
    expect(saved.has("ollama_model")).toBe(false);
  });

  it("keeps the tunnel password write-only", async () => {
    saved.set("ollama", "https://mac.example.com");
    await put({ token: "me:s3cret" });
    const body = await (await GET()).json();
    expect(body.hasToken).toBe(true);
    expect(JSON.stringify(body)).not.toContain("s3cret");
  });

  it("tests the connection through the tunnel and lists the computer's models", async () => {
    saved.set("ollama", "https://mac.example.com/");
    saved.set("ollama_token", "tok");
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: [{ id: "llama3.1:8b" }, { id: "qwen2.5:14b" }] })));
    vi.stubGlobal("fetch", fetchMock);
    const body = await (await POST()).json();
    expect(body).toMatchObject({ ok: true, models: ["llama3.1:8b", "qwen2.5:14b"] });
    expect(fetchMock).toHaveBeenCalledWith("https://mac.example.com/v1/models", expect.objectContaining({ headers: { Authorization: "Bearer tok" } }));
  });

  it("says plainly when the computer doesn't answer or refuses the password", async () => {
    saved.set("ollama", "https://mac.example.com");
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("down"); }));
    expect(await (await POST()).json()).toMatchObject({ ok: false, error: expect.stringMatching(/No answer/) });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("no", { status: 401 })));
    expect(await (await POST()).json()).toMatchObject({ ok: false, error: expect.stringMatching(/password/) });
  });
});
