import { createHmac } from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;
const tables: Record<string, Row[]> = {};

// Just enough of the db query builder for these flows: eq filters, select,
// maybeSingle, single, update, insert, upsert.
function from(table: string) {
  const filters: [string, unknown][] = [];
  let patch: Row | null = null;
  const rows = () => (tables[table] ??= []).filter((r) => filters.every(([k, v]) => r[k] === v));
  const q = {
    select: () => q,
    eq: (k: string, v: unknown) => { filters.push([k, v]); return q; },
    update: (p: Row) => { patch = p; return q; },
    insert: async (r: Row) => { (tables[table] ??= []).push(r); return { error: null }; },
    upsert: async (r: Row) => {
      if (!(tables[table] ??= []).some((x) => x.user_id === r.user_id)) tables[table].push({ history: [], pending: null, ...r });
      return { error: null };
    },
    maybeSingle: async () => ({ data: rows()[0] ?? null }),
    single: async () => ({ data: rows()[0] ?? null }),
    then: (ok: (v: unknown) => void) => {
      if (patch) rows().forEach((r) => Object.assign(r, patch));
      ok({ data: rows(), error: null });
    },
  };
  return q;
}

const limits = new Map<string, number>();
const rpc = async (_fn: string, a: { p_bucket: string; p_key: string }) => {
  const k = `${a.p_bucket}:${a.p_key}`;
  limits.set(k, (limits.get(k) ?? 0) + 1);
  return { data: limits.get(k), error: null };
};
vi.mock("@/lib/db", () => ({ getDb: () => ({ from, rpc }) }));
vi.mock("@/lib/crypto", () => ({ decrypt: (s: string) => s.replace(/^enc:/, "") }));
const processed = new Set<string>();
vi.mock("@/lib/cron", () => ({
  alreadyProcessed: async (_: unknown, _u: string, _s: string, id: string) => processed.has(id),
  markProcessed: async (_: unknown, _u: string, _s: string, id: string) => { processed.add(id); },
}));

const sent: { to: string; body: string }[] = [];
const calls: { url: string; body: Row; auth: string | null }[] = [];
let chatSse = "";

beforeEach(() => {
  limits.clear();
  for (const k of Object.keys(tables)) delete tables[k];
  processed.clear();
  sent.length = 0;
  calls.length = 0;
  process.env.WHATSAPP_TOKEN = "t";
  process.env.WHATSAPP_PHONE_NUMBER_ID = "pn";
  process.env.WHATSAPP_VERIFY_TOKEN = "v";
  process.env.WHATSAPP_APP_SECRET = "secret";
  process.env.NEXTAUTH_URL = "https://app.test";
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    if (url.includes("graph.facebook.com")) {
      sent.push({ to: body.to, body: body.text?.body ?? `[template] ${body.template.components[0].parameters[0].text}` });
      return new Response("{}");
    }
    calls.push({ url, body, auth: new Headers(init.headers).get("authorization") });
    if (url.endsWith("/api/act")) return new Response(JSON.stringify({ ok: true, result: "Email sent to v@x.com." }));
    return new Response(chatSse);
  }));
});

const linked = (extra: Row = {}) => {
  tables.whatsapp_links = [{
    user_id: "me@x.com", phone: "919800000000", gateway_token_enc: "enc:te_gw_abc", history: [], pending: null,
    notify: true, last_inbound_at: null, ...extra,
  }];
};
const msg = (body: string, id = "w1") => ({ id, from: "919800000000", type: "text", text: { body } });
const sse = (...events: [string, unknown][]) => events.map(([e, d]) => `event: ${e}\ndata: ${JSON.stringify(d)}`).join("\n\n");

describe("whatsapp helpers", () => {
  it("accepts only Meta's signature for the exact body", async () => {
    const { validSignature } = await import("@/lib/whatsapp");
    const sig = `sha256=${createHmac("sha256", "secret").update("{}").digest("hex")}`;
    expect(validSignature("{}", sig)).toBe(true);
    expect(validSignature("{ }", sig)).toBe(false);
    expect(validSignature("{}", null)).toBe(false);
  });

  it("turns markdown into WhatsApp formatting", async () => {
    const { toWhatsAppText } = await import("@/lib/whatsapp");
    expect(toWhatsAppText("## Today\n**3 tasks** - [Draft](https://mail.google.com/x)")).toBe("Today\n*3 tasks* - Draft (https://mail.google.com/x)");
  });

  it("uses plain text inside the 24-hour window and the template outside it", async () => {
    const { notifyWhatsApp } = await import("@/lib/whatsapp");
    linked({ last_inbound_at: new Date().toISOString() });
    await notifyWhatsApp("me@x.com", "Reminder");
    linked({ last_inbound_at: new Date(Date.now() - 2 * 86400000).toISOString() });
    await notifyWhatsApp("me@x.com", "Reminder");
    expect(sent.map((s) => s.body)).toEqual(["Reminder", "[template] Reminder"]);
  });

  it("sends nothing when updates are switched off", async () => {
    const { notifyWhatsApp } = await import("@/lib/whatsapp");
    linked({ notify: false });
    expect(await notifyWhatsApp("me@x.com", "x")).toBe(false);
    expect(sent).toEqual([]);
  });
});

describe("handleInbound", () => {
  it("links a number with a valid code", async () => {
    tables.whatsapp_links = [{ user_id: "me@x.com", phone: null, link_code: "123456", code_expires_at: new Date(Date.now() + 60000).toISOString() }];
    const { handleInbound } = await import("@/lib/whatsappAgent");
    await handleInbound(msg("LINK 123456"));
    expect(tables.whatsapp_links[0]).toMatchObject({ phone: "919800000000", link_code: null });
    expect(sent[0].body).toMatch(/Linked/);
  });

  it("refuses an expired code", async () => {
    tables.whatsapp_links = [{ user_id: "me@x.com", phone: null, link_code: "123456", code_expires_at: new Date(Date.now() - 1).toISOString() }];
    const { handleInbound } = await import("@/lib/whatsappAgent");
    await handleInbound(msg("link 123456"));
    expect(tables.whatsapp_links[0].phone).toBeNull();
    expect(sent[0].body).toMatch(/expired/);
  });

  it("stops a number guessing codes after five tries an hour", async () => {
    tables.whatsapp_links = [{ user_id: "me@x.com", phone: null, link_code: "123456", code_expires_at: new Date(Date.now() + 60000).toISOString() }];
    const { handleInbound } = await import("@/lib/whatsappAgent");
    for (let i = 0; i < 5; i++) await handleInbound(msg(`LINK 00000${i}`, `g${i}`));
    await handleInbound(msg("LINK 123456", "g5"));
    expect(tables.whatsapp_links[0].phone).toBeNull();
    expect(sent.at(-1)!.body).toMatch(/Too many link attempts/);
  });

  it("tells an unknown number how to link, without calling the assistant", async () => {
    const { handleInbound } = await import("@/lib/whatsappAgent");
    await handleInbound(msg("hi"));
    expect(calls).toEqual([]);
    expect(sent[0].body).toMatch(/isn't linked/);
  });

  it("answers as the linked user and saves the tasks JARVIS created", async () => {
    linked();
    chatSse = sse(["text", { text: "Added **Call mom**." }], ["done", { sideEffects: [{ type: "task_create", data: { title: "Call mom" } }] }]);
    const { handleInbound } = await import("@/lib/whatsappAgent");
    await handleInbound(msg("remind me to call mom"));
    expect(calls[0]).toMatchObject({ url: "https://app.test/api/chat", auth: "Bearer te_gw_abc" });
    expect(tables.tasks).toEqual([expect.objectContaining({ user_id: "me@x.com", title: "Call mom", status: "todo" })]);
    expect(sent[0].body).toBe("Added *Call mom*.");
  });

  it("holds a sensitive action until YES, then runs it", async () => {
    linked();
    chatSse = sse(["text", { text: "Here's the draft." }], ["confirm", { tool: "communicate", args: { action: "email" }, summary: "Email v@x.com" }], ["done", {}]);
    const { handleInbound } = await import("@/lib/whatsappAgent");
    await handleInbound(msg("email v"));
    expect(sent[0].body).toMatch(/Reply \*YES\*/);
    expect(tables.whatsapp_links[0].pending).toMatchObject({ tool: "communicate" });
    await handleInbound(msg("yes", "w2"));
    expect(calls[1]).toMatchObject({ url: "https://app.test/api/act", body: { tool: "communicate", args: { action: "email" } } });
    expect(sent[1].body).toBe("Email sent to v@x.com.");
    expect(tables.whatsapp_links[0].pending).toBeNull();
  });

  it("cancels on NO and answers a redelivered message only once", async () => {
    linked({ pending: { tool: "communicate", args: {}, summary: "x" } });
    const { handleInbound } = await import("@/lib/whatsappAgent");
    await handleInbound(msg("no"));
    await handleInbound(msg("no"));
    expect(calls).toEqual([]);
    expect(sent.map((s) => s.body)).toEqual(["Cancelled - nothing was done."]);
  });
});

describe("OpenClaw bridge", () => {
  const post = async (text: string, auth?: string) => {
    const { POST } = await import("@/app/api/bridge/message/route");
    const res = await POST(new Request("https://app.test/api/bridge/message", {
      method: "POST", headers: auth ? { authorization: auth } : {}, body: JSON.stringify({ text }),
    }) as never);
    return { status: res.status, body: await res.json() };
  };
  const token = async (revoked: string | null = null) => {
    const { hashToken } = await import("@/lib/gatewayAuth");
    tables.gateway_tokens = [{ user_id: "me@x.com", name: "OpenClaw", token_hash: hashToken("te_gw_claw"), scopes: ["chat"], revoked_at: revoked }];
  };

  it("refuses a missing, unknown or revoked token without calling the assistant", async () => {
    expect((await post("hi")).status).toBe(401);
    expect((await post("hi", "Bearer te_gw_nope")).status).toBe(401);
    await token("2026-10-24T00:00:00Z");
    expect((await post("hi", "Bearer te_gw_claw")).status).toBe(401);
    expect(calls).toEqual([]);
  });

  it("answers as the token's user and returns the reply instead of sending it", async () => {
    await token();
    chatSse = sse(["text", { text: "Added Call mom." }], ["done", { sideEffects: [{ type: "task_create", data: { title: "Call mom" } }] }]);
    const r = await post("remind me to call mom", "Bearer te_gw_claw");
    expect(r).toEqual({ status: 200, body: { reply: "Added Call mom." } });
    expect(calls[0]).toMatchObject({ url: "https://app.test/api/chat", auth: "Bearer te_gw_claw" });
    expect(tables.tasks).toEqual([expect.objectContaining({ user_id: "me@x.com", title: "Call mom" })]);
    expect(tables.whatsapp_links[0].history).toHaveLength(2);
    expect(sent).toEqual([]);
  });

  it("runs a held action when the next message is YES", async () => {
    await token();
    chatSse = sse(["text", { text: "Draft ready." }], ["confirm", { tool: "communicate", args: { action: "email" }, summary: "Email v@x.com" }], ["done", {}]);
    expect((await post("email v", "Bearer te_gw_claw")).body.reply).toMatch(/Reply \*YES\*/);
    expect((await post("YES", "Bearer te_gw_claw")).body.reply).toBe("Email sent to v@x.com.");
    expect(calls[1]).toMatchObject({ url: "https://app.test/api/act", body: { tool: "communicate" } });
  });
});
