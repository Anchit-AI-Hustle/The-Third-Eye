import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const rows = new Map<string, string>();
vi.mock("@/lib/db", () => ({
  getDb: () => ({
    from: () => ({
      select: () => ({ eq: async () => ({ data: [...rows].map(([provider, key_enc]) => ({ provider, key_enc })) }) }),
      upsert: async (r: { provider: string; key_enc: string }) => { rows.set(r.provider, r.key_enc); return { error: null }; },
      delete: () => ({ eq: () => ({ eq: async (_c: string, p: string) => { rows.delete(p); } }) }),
    }),
  }),
}));

import { decrypt } from "@/lib/crypto";
import { HF_OAUTH, loadOwnKeys, saveHuggingFace } from "@/lib/providerKeys";

const client = "https://app.example.com/.well-known/oauth-cimd";
const stored = () => JSON.parse(decrypt(rows.get(HF_OAUTH)!)!);
let user = 0;

beforeEach(() => { process.env.TOKEN_ENCRYPTION_KEY = "test-key"; rows.clear(); user++; });
afterEach(() => vi.unstubAllGlobals());

describe("a Hugging Face sign-in", () => {
  it("saves the token as the user's key and what renews it", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_000_000);
    expect(await saveHuggingFace(`u${user}`, client, { access_token: "hf_a", refresh_token: "r1", expires_in: 3600 })).toBe(true);
    vi.restoreAllMocks();
    expect(decrypt(rows.get("huggingface")!)).toBe("hf_a");
    expect(stored()).toEqual({ refresh: "r1", client, expires: 1_000_000 + 3_600_000 });
  });

  it("refuses a reply with no token", async () => {
    expect(await saveHuggingFace(`u${user}`, client, { error: "invalid_grant" } as never)).toBe(false);
    expect(rows.size).toBe(0);
  });

  it("renews a token that is about to lapse before the user's next request", async () => {
    await saveHuggingFace(`u${user}`, client, { access_token: "hf_old", refresh_token: "r1", expires_in: 60 });
    const fetchMock = vi.fn(async () => Response.json({ access_token: "hf_new", refresh_token: "r2", expires_in: 3600 }));
    vi.stubGlobal("fetch", fetchMock);
    expect((await loadOwnKeys(`u${user}`)).huggingface).toBe("hf_new");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://huggingface.co/oauth/token");
    expect(Object.fromEntries(new URLSearchParams(String(init.body)))).toEqual({ grant_type: "refresh_token", refresh_token: "r1", client_id: client });
    expect(stored().refresh).toBe("r2");
  });

  it("leaves a fresh token alone", async () => {
    await saveHuggingFace(`u${user}`, client, { access_token: "hf_fresh", refresh_token: "r1", expires_in: 3600 });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect((await loadOwnKeys(`u${user}`)).huggingface).toBe("hf_fresh");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps the old token when renewal fails", async () => {
    await saveHuggingFace(`u${user}`, client, { access_token: "hf_old", refresh_token: "r1", expires_in: 60 });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("no", { status: 400 })));
    expect((await loadOwnKeys(`u${user}`)).huggingface).toBe("hf_old");
  });
});
