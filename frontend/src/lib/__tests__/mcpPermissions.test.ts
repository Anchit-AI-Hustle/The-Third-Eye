import { describe, it, expect } from "vitest";
import { isSensitive, summarizeAction } from "@/lib/actions";
import {
  isMcpWrite,
  mcpToolRisk,
  parseMcpName,
  summarizeMcpAction,
} from "@/lib/mcp/permissions";

describe("parseMcpName", () => {
  it("splits server and tool", () => {
    expect(parseMcpName("mcp__Gmail__send_message")).toEqual({ server: "Gmail", tool: "send_message" });
  });

  it("keeps separators that belong to the tool name", () => {
    expect(parseMcpName("mcp__github__pull_request_read")).toEqual({
      server: "github",
      tool: "pull_request_read",
    });
    // A tool name may itself contain "__"; only the first separator is the split.
    expect(parseMcpName("mcp__srv__a__b")).toEqual({ server: "srv", tool: "a__b" });
  });

  it("rejects anything that isn't a qualified MCP name", () => {
    expect(parseMcpName("send_email")).toBeNull();
    expect(parseMcpName("mcp__")).toBeNull();
    expect(parseMcpName("mcp__onlyserver")).toBeNull();
    expect(parseMcpName("mcp____tool")).toBeNull();
  });
});

describe("mcpToolRisk", () => {
  const reads = [
    "mcp__Gmail__search_threads",
    "mcp__Gmail__get_message",
    "mcp__Google_Calendar__list_events",
    "mcp__Shopify__search_products",
    "mcp__github__get_file_contents",
    "mcp__Klaviyo__get_campaigns",
    "mcp__Supabase__list_tables",
    "mcp__Motion__get_creative_insights",
  ];

  const writes = [
    "mcp__Gmail__send_message",
    "mcp__Gmail__trash_thread",
    "mcp__Gmail__reply",
    "mcp__Google_Calendar__create_event",
    "mcp__Google_Calendar__delete_event",
    "mcp__Shopify__create_discount",
    "mcp__Shopify__set_inventory",
    "mcp__Klaviyo__send_campaign",
    "mcp__Klaviyo__bulk_import_profiles",
    "mcp__Meta_Ads__ads_create_campaign",
    "mcp__Supabase__apply_migration",
    "mcp__Supabase__execute_sql",
    "mcp__Vercel__deploy_to_vercel",
    "mcp__Vercel__buy_domain",
  ];

  for (const name of reads) {
    it(`treats ${name} as read`, () => {
      expect(mcpToolRisk(name)).toBe("read");
      expect(isMcpWrite(name)).toBe(false);
    });
  }

  for (const name of writes) {
    it(`treats ${name} as write`, () => {
      expect(mcpToolRisk(name)).toBe("write");
      expect(isMcpWrite(name)).toBe(true);
    });
  }

  it("lets a write verb win over a read verb in the same name", () => {
    // Reading only the leading word would wave these through.
    expect(mcpToolRisk("mcp__srv__get_or_create_profile")).toBe("write");
    expect(mcpToolRisk("mcp__srv__search_and_update")).toBe("write");
    expect(mcpToolRisk("mcp__srv__list_then_delete")).toBe("write");
  });

  it("handles camelCase tool names", () => {
    expect(mcpToolRisk("mcp__Stytch__createProject")).toBe("write");
    expect(mcpToolRisk("mcp__Stytch__getAllPublicTokens")).toBe("read");
  });

  it("fails closed on an unrecognised verb", () => {
    expect(mcpToolRisk("mcp__srv__frobnicate")).toBe("write");
    expect(mcpToolRisk("mcp__srv__xyzzy_the_thing")).toBe("write");
  });

  it("fails closed on an unparseable name", () => {
    expect(mcpToolRisk("mcp__broken")).toBe("write");
  });
});

describe("isSensitive with connector tools", () => {
  it("still gates the hand-curated built-ins", () => {
    expect(isSensitive("send_email")).toBe(true);
    expect(isSensitive("pay")).toBe(true);
  });

  it("leaves ordinary built-ins ungated", () => {
    expect(isSensitive("get_weather")).toBe(false);
    expect(isSensitive("manage_tasks")).toBe(false);
  });

  it("gates a connector write so it cannot run silently", () => {
    expect(isSensitive("mcp__Gmail__send_message")).toBe(true);
    expect(isSensitive("mcp__Shopify__create_discount")).toBe(true);
  });

  it("does not gate a connector read", () => {
    expect(isSensitive("mcp__Gmail__search_threads")).toBe(false);
    expect(isSensitive("mcp__Supabase__list_tables")).toBe(false);
  });
});

describe("summarizeMcpAction", () => {
  it("names the connector and the action in words", () => {
    expect(summarizeMcpAction("mcp__Gmail__send_message", {})).toBe("Gmail: send message");
  });

  it("shows the arguments being approved", () => {
    const s = summarizeMcpAction("mcp__Gmail__send_message", {
      to: "vendor@example.com",
      subject: "Q3 numbers",
    });
    expect(s).toContain("Gmail: send message");
    expect(s).toContain("to: vendor@example.com");
    expect(s).toContain("subject: Q3 numbers");
  });

  it("never puts a credential on the confirmation card", () => {
    const s = summarizeMcpAction("mcp__srv__create_thing", {
      name: "widget",
      access_token: "ya29.super-secret",
      apiKey: "sk-live-123",
      password: "hunter2",
    });
    expect(s).toContain("name: widget");
    expect(s).not.toContain("ya29");
    expect(s).not.toContain("sk-live-123");
    expect(s).not.toContain("hunter2");
  });

  it("truncates a long value rather than filling the card", () => {
    const s = summarizeMcpAction("mcp__srv__create_thing", { body: "x".repeat(500) });
    expect(s.length).toBeLessThan(200);
    expect(s).toContain("…");
  });

  it("skips nested payloads that would be unreadable", () => {
    const s = summarizeMcpAction("mcp__srv__create_thing", {
      title: "ok",
      nested: { a: 1, b: [2, 3] },
    });
    expect(s).toContain("title: ok");
    expect(s).not.toContain("nested");
  });

  it("is what summarizeAction returns for connector tools", () => {
    expect(summarizeAction("mcp__Gmail__send_message", { to: "a@b.com" })).toBe(
      summarizeMcpAction("mcp__Gmail__send_message", { to: "a@b.com" }),
    );
  });
});
