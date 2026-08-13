import { beforeEach, describe, expect, it, vi } from "vitest";

import { GATEWAY_SCOPES, bearerFrom, emailForToken, hashToken, mintToken } from "@/lib/gatewayAuth";

let row: Record<string, unknown> | null = null;
let supabaseConfigured = true;
const updates: Array<Record<string, unknown>> = [];

const sb = {
  from() {
    return {
      select() {
        return { eq: () => ({ maybeSingle: () => Promise.resolve({ data: row }) }) };
      },
      update(patch: Record<string, unknown>) {
        updates.push(patch);
        return { eq: () => Promise.resolve({ error: null }) };
      },
    };
  },
};

vi.mock("@/lib/serverSupabase", () => ({
  getAdminSupabase: () => (supabaseConfigured ? sb : null),
}));

beforeEach(() => {
  row = null;
  updates.length = 0;
  supabaseConfigured = true;
});

describe("minting", () => {
  it("returns a token and the hash that will be stored for it", () => {
    const { token, hash } = mintToken();
    expect(token.startsWith("te_gw_")).toBe(true);
    expect(hash).toBe(hashToken(token));
  });

  it("never returns the same token twice", () => {
    const seen = new Set(Array.from({ length: 200 }, () => mintToken().token));
    expect(seen.size).toBe(200);
  });

  it("stores a hash, not the credential", () => {
    const { token, hash } = mintToken();
    // A leaked row must not be replayable as a bearer token.
    expect(hash).not.toContain(token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("reading the header", () => {
  it("accepts a well-formed bearer token", () => {
    const h = new Headers({ authorization: "Bearer te_gw_abc" });
    expect(bearerFrom(h)).toBe("te_gw_abc");
  });

  it.each([
    ["no header", {}],
    ["not a bearer scheme", { authorization: "Basic te_gw_abc" }],
    ["a bearer token that is not ours", { authorization: "Bearer sk-live-123" }],
    ["an empty bearer", { authorization: "Bearer " }],
  ])("rejects %s", (_label, init) => {
    expect(bearerFrom(new Headers(init as Record<string, string>))).toBeNull();
  });
});

describe("resolving a token to a user", () => {
  const token = "te_gw_valid";

  it("returns the owner for a live, correctly scoped token", async () => {
    row = { user_id: "user@example.com", scopes: ["chat"], revoked_at: null };
    expect(await emailForToken(token, "chat")).toBe("user@example.com");
  });

  it("refuses a revoked token", async () => {
    row = { user_id: "user@example.com", scopes: ["chat"], revoked_at: "2026-01-01T00:00:00Z" };
    expect(await emailForToken(token, "chat")).toBeNull();
  });

  it("refuses a token that is not scoped for what is being attempted", async () => {
    row = { user_id: "user@example.com", scopes: ["transcribe"], revoked_at: null };
    expect(await emailForToken(token, "chat")).toBeNull();
  });

  it("refuses a token with no scopes at all", async () => {
    row = { user_id: "user@example.com", scopes: [], revoked_at: null };
    expect(await emailForToken(token, "chat")).toBeNull();
  });

  it("refuses an unknown token", async () => {
    row = null;
    expect(await emailForToken(token, "chat")).toBeNull();
  });

  it("refuses everything when there is no database to check against", async () => {
    supabaseConfigured = false;
    expect(await emailForToken(token, "chat")).toBeNull();
  });

  it("records that the token was used", async () => {
    row = { user_id: "user@example.com", scopes: ["data"], revoked_at: null };
    await emailForToken(token, "data");
    expect(updates[0]).toHaveProperty("last_used_at");
  });

  it("honours each scope independently", async () => {
    for (const scope of GATEWAY_SCOPES) {
      row = { user_id: "user@example.com", scopes: [scope], revoked_at: null };
      expect(await emailForToken(token, scope)).toBe("user@example.com");
      const others = GATEWAY_SCOPES.filter((s) => s !== scope);
      for (const other of others) {
        expect(await emailForToken(token, other)).toBeNull();
      }
    }
  });
});
