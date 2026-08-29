import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * /api/act executes an action the user has already confirmed.
 *
 * Regression this pins: sending mail used to be premium-gated inside runTool's
 * `communicate` case. Once the email action became confirm-first, it stopped
 * reaching runTool at all — and /api/act only checked PREMIUM_TOOLS, which does
 * not contain `communicate`. That left email sending free whenever
 * ENFORCE_PREMIUM was on. The other communicate actions (whatsapp/sms/call/
 * read_emails) were never premium, and must stay that way.
 */

const SIGNED_IN = "user@example.com";

let sessionEmail: string | null = SIGNED_IN;
vi.mock("next-auth", () => ({
  getServerSession: () => Promise.resolve(sessionEmail ? { user: { email: sessionEmail } } : null),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

let enforced = false;
vi.mock("@/lib/entitlements", () => ({
  premiumEnforced: () => enforced,
  PREMIUM_TOOLS: new Set<string>(["multi_agent_run"]),
}));

let tier = "free";
vi.mock("@/lib/usage", () => ({ getTier: () => Promise.resolve(tier) }));

let googleToken: string | null = "ya29.token";
vi.mock("@/lib/googleToken", () => ({
  getGoogleAccessToken: () =>
    Promise.resolve(googleToken ? { accessToken: googleToken, scope: "" } : null),
}));

const callMcpTool = vi.fn().mockResolvedValue("mcp ok");
vi.mock("@/lib/mcp/client", () => ({
  callMcpTool: (...a: unknown[]) => callMcpTool(...a),
  isMcpTool: (t: string) => t.startsWith("mcp__"),
}));

async function post(body: unknown) {
  const { POST } = await import("@/app/api/act/route");
  const res = await POST({ json: () => Promise.resolve(body) } as any);
  return { status: res.status, body: await res.json() };
}

const EMAIL_ARGS = { action: "email", to: "v@x.com", subject: "Hi", body: "Text" };

beforeEach(() => {
  vi.resetModules();
  sessionEmail = SIGNED_IN;
  enforced = false;
  tier = "free";
  googleToken = "ya29.token";
  callMcpTool.mockClear();
  // Gmail's REST call is the only thing that would reach the network.
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify({ id: "m1" }), { status: 200 }),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("premium gating on the confirmed email send", () => {
  it("blocks a free user from sending when enforcement is on", async () => {
    enforced = true;
    tier = "free";
    const { body } = await post({ tool: "communicate", args: EMAIL_ARGS });
    expect(body.ok).toBe(false);
    expect(String(body.result)).toMatch(/Premium/i);
    // Nothing may reach Gmail.
    expect(vi.mocked(globalThis.fetch)).not.toHaveBeenCalled();
  });

  it("lets a premium user send when enforcement is on", async () => {
    enforced = true;
    tier = "premium";
    const { body } = await post({ tool: "communicate", args: EMAIL_ARGS });
    expect(body.ok).toBe(true);
    expect(String(body.result)).toContain("v@x.com");
  });

  it("lets anyone send while enforcement is off (launch mode)", async () => {
    enforced = false;
    tier = "free";
    const { body } = await post({ tool: "communicate", args: EMAIL_ARGS });
    expect(body.ok).toBe(true);
  });

  it("applies the same gate to the legacy send_email label", async () => {
    enforced = true;
    tier = "free";
    const { body } = await post({ tool: "send_email", args: { to: "v@x.com", body: "t" } });
    expect(body.ok).toBe(false);
    expect(String(body.result)).toMatch(/Premium/i);
  });
});

describe("what the endpoint accepts", () => {
  it("rejects an unauthenticated caller", async () => {
    sessionEmail = null;
    const { status } = await post({ tool: "communicate", args: EMAIL_ARGS });
    expect(status).toBe(401);
  });

  it("rejects a non-confirmable action", async () => {
    const { status, body } = await post({ tool: "get_weather", args: {} });
    expect(status).toBe(400);
    expect(String(body.error)).toMatch(/non-confirmable/i);
  });

  it("rejects communicate's deep-link modes — they are not confirmed here", async () => {
    // whatsapp/sms/call open a prefilled app on the tap; routing them through
    // this endpoint would mean a send with no app involved.
    for (const action of ["whatsapp", "sms", "call", "read_emails"]) {
      const { status } = await post({ tool: "communicate", args: { action, to: "1" } });
      expect(status).toBe(400);
    }
  });

  it("reports a missing Gmail grant instead of claiming success", async () => {
    googleToken = null;
    const { body } = await post({ tool: "communicate", args: EMAIL_ARGS });
    expect(body.ok).toBe(false);
    expect(String(body.result)).toMatch(/isn't connected/i);
  });

  it("reports a revoked scope distinctly from a generic rejection", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(new Response("{}", { status: 403 }));
    const { body } = await post({ tool: "communicate", args: EMAIL_ARGS });
    expect(body.ok).toBe(false);
    expect(String(body.result)).toMatch(/permission isn't granted/i);
  });
});

describe("confirmed connector writes", () => {
  it("runs an approved MCP write and passes the user through", async () => {
    const { body } = await post({ tool: "mcp__google__gmail_send", args: { to: "a@b.com" } });
    expect(body.ok).toBe(true);
    expect(callMcpTool).toHaveBeenCalledWith("mcp__google__gmail_send", { to: "a@b.com" }, SIGNED_IN);
  });

  it("does not accept an MCP read here — reads never need confirming", async () => {
    const { status } = await post({ tool: "mcp__google__gmail_search", args: { query: "x" } });
    expect(status).toBe(400);
    expect(callMcpTool).not.toHaveBeenCalled();
  });
});
