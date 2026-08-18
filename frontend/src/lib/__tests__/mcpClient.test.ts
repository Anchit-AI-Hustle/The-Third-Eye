import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  callMcpTool,
  configuredServers,
  discoverTools,
  isMcpTool,
  mcpToolDeclarations,
  qualifiedName,
  resetMcpCache,
} from "@/lib/mcp/client";

function setServers(value: unknown) {
  process.env.MCP_SERVERS = typeof value === "string" ? value : JSON.stringify(value);
}

/** A fetch stub that answers per-URL, so multi-server behaviour is testable. */
function mockRpc(handlers: Record<string, (method: string, params: any) => unknown>) {
  return vi.fn(async (url: string, init: any) => {
    const body = JSON.parse(init.body);
    const handler = handlers[url];
    if (!handler) throw new Error("connect ECONNREFUSED");
    const result = handler(body.method, body.params);
    if (result instanceof Error) throw result;
    return { ok: true, json: async () => ({ jsonrpc: "2.0", id: body.id, result }) };
  });
}

beforeEach(() => {
  resetMcpCache();
  delete process.env.MCP_SERVERS;
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.MCP_SERVERS;
});

describe("reading the configuration", () => {
  it("is off when nothing is configured", () => {
    expect(configuredServers()).toEqual([]);
  });

  it("reads a well-formed server list", () => {
    setServers([{ name: "weather", url: "https://mcp.example.com/rpc" }]);
    expect(configuredServers()).toHaveLength(1);
  });

  it("stays off rather than throwing on malformed JSON", () => {
    setServers("{not json");
    expect(configuredServers()).toEqual([]);
  });

  it("ignores a config that is not a list", () => {
    setServers({ name: "x", url: "https://example.com" });
    expect(configuredServers()).toEqual([]);
  });

  it.each([
    ["a missing url", { name: "x" }],
    ["a missing name", { url: "https://example.com" }],
    ["a non-http scheme", { name: "x", url: "file:///etc/passwd" }],
    ["a bare hostname", { name: "x", url: "example.com" }],
  ])("drops an entry with %s", (_label, entry) => {
    setServers([entry]);
    expect(configuredServers()).toEqual([]);
  });

  it("keeps the good entries alongside a bad one", () => {
    setServers([{ name: "ok", url: "https://ok.example.com" }, { name: "bad", url: "ftp://nope" }]);
    expect(configuredServers().map((s) => s.name)).toEqual(["ok"]);
  });
});

describe("discovering tools", () => {
  it("returns nothing when no servers are configured", async () => {
    expect(await discoverTools()).toEqual([]);
  });

  it("collects tools from every server", async () => {
    setServers([
      { name: "a", url: "https://a.example.com" },
      { name: "b", url: "https://b.example.com" },
    ]);
    vi.stubGlobal("fetch", mockRpc({
      "https://a.example.com": () => ({ tools: [{ name: "one" }] }),
      "https://b.example.com": () => ({ tools: [{ name: "two" }] }),
    }));

    const found = await discoverTools();
    expect(found.map((f) => f.tool.name).sort()).toEqual(["one", "two"]);
  });

  it("keeps the reachable server's tools when another is down", async () => {
    // A broken MCP endpoint must cost its own tools, not the whole conversation.
    setServers([
      { name: "up", url: "https://up.example.com" },
      { name: "down", url: "https://down.example.com" },
    ]);
    vi.stubGlobal("fetch", mockRpc({
      "https://up.example.com": () => ({ tools: [{ name: "alive" }] }),
    }));

    const found = await discoverTools();
    expect(found.map((f) => f.tool.name)).toEqual(["alive"]);
  });

  it("survives a server that answers with no tools array", async () => {
    setServers([{ name: "empty", url: "https://empty.example.com" }]);
    vi.stubGlobal("fetch", mockRpc({ "https://empty.example.com": () => ({}) }));
    expect(await discoverTools()).toEqual([]);
  });

  it("does not re-query within the cache window", async () => {
    setServers([{ name: "a", url: "https://a.example.com" }]);
    const fetchMock = mockRpc({ "https://a.example.com": () => ({ tools: [{ name: "one" }] }) });
    vi.stubGlobal("fetch", fetchMock);

    await discoverTools();
    await discoverTools();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("namespacing", () => {
  it("qualifies a tool with its server", () => {
    expect(qualifiedName("weather", "forecast")).toBe("mcp__weather__forecast");
  });

  it("recognises its own names", () => {
    expect(isMcpTool("mcp__weather__forecast")).toBe(true);
  });

  it("never claims a built-in tool", () => {
    // A server publishing "manage_tasks" must not shadow the real one.
    for (const builtin of ["manage_tasks", "send_email", "create_asset", "automate"]) {
      expect(isMcpTool(builtin)).toBe(false);
      expect(qualifiedName("evil", builtin)).not.toBe(builtin);
    }
  });
});

describe("declarations handed to the model", () => {
  it("advertises each tool under its qualified name", async () => {
    setServers([{ name: "weather", url: "https://w.example.com" }]);
    vi.stubGlobal("fetch", mockRpc({
      "https://w.example.com": () => ({
        tools: [{ name: "forecast", description: "Get a forecast", inputSchema: { type: "OBJECT", properties: {} } }],
      }),
    }));

    const decls = await mcpToolDeclarations();
    expect(decls[0]).toMatchObject({ name: "mcp__weather__forecast", description: "Get a forecast" });
  });

  it("substitutes a description when the server omits one", async () => {
    setServers([{ name: "weather", url: "https://w.example.com" }]);
    vi.stubGlobal("fetch", mockRpc({ "https://w.example.com": () => ({ tools: [{ name: "forecast" }] }) }));
    const decls = await mcpToolDeclarations();
    expect(decls[0].description).toContain("weather");
  });

  it("gives a schemaless tool an empty parameter object rather than undefined", async () => {
    setServers([{ name: "s", url: "https://s.example.com" }]);
    vi.stubGlobal("fetch", mockRpc({ "https://s.example.com": () => ({ tools: [{ name: "t" }] }) }));
    const decls = await mcpToolDeclarations();
    expect(decls[0].parameters).toEqual({ type: "OBJECT", properties: {} });
  });
});

describe("calling a tool", () => {
  beforeEach(() => {
    setServers([{ name: "weather", url: "https://w.example.com" }]);
  });

  it("returns the text content", async () => {
    vi.stubGlobal("fetch", mockRpc({
      "https://w.example.com": (method) =>
        method === "tools/list"
          ? { tools: [{ name: "forecast" }] }
          : { content: [{ type: "text", text: "Sunny, 24°C" }] },
    }));
    expect(await callMcpTool("mcp__weather__forecast", { city: "Delhi" })).toBe("Sunny, 24°C");
  });

  it("joins multiple text blocks", async () => {
    vi.stubGlobal("fetch", mockRpc({
      "https://w.example.com": (method) =>
        method === "tools/list"
          ? { tools: [{ name: "forecast" }] }
          : { content: [{ type: "text", text: "line one" }, { type: "text", text: "line two" }] },
    }));
    expect(await callMcpTool("mcp__weather__forecast", {})).toBe("line one\nline two");
  });

  it("ignores non-text content blocks", async () => {
    vi.stubGlobal("fetch", mockRpc({
      "https://w.example.com": (method) =>
        method === "tools/list"
          ? { tools: [{ name: "forecast" }] }
          : { content: [{ type: "image", data: "…" }, { type: "text", text: "caption" }] },
    }));
    expect(await callMcpTool("mcp__weather__forecast", {})).toBe("caption");
  });

  it("reports a tool-level error as text", async () => {
    vi.stubGlobal("fetch", mockRpc({
      "https://w.example.com": (method) =>
        method === "tools/list"
          ? { tools: [{ name: "forecast" }] }
          : { isError: true, content: [{ type: "text", text: "city not found" }] },
    }));
    expect(await callMcpTool("mcp__weather__forecast", {})).toContain("city not found");
  });

  it("says so when the tool does not exist", async () => {
    vi.stubGlobal("fetch", mockRpc({ "https://w.example.com": () => ({ tools: [] }) }));
    expect(await callMcpTool("mcp__weather__nope", {})).toContain("No MCP tool");
  });

  it("returns an unreachable server as text rather than throwing", async () => {
    // Thrown here, this would end the conversation instead of one tool call.
    vi.stubGlobal("fetch", mockRpc({
      "https://w.example.com": (method) =>
        method === "tools/list" ? { tools: [{ name: "forecast" }] } : new Error("socket hang up"),
    }));
    await expect(callMcpTool("mcp__weather__forecast", {})).resolves.toContain("Could not reach");
  });

  it("describes an empty response rather than returning nothing", async () => {
    vi.stubGlobal("fetch", mockRpc({
      "https://w.example.com": (method) =>
        method === "tools/list" ? { tools: [{ name: "forecast" }] } : { content: [] },
    }));
    expect(await callMcpTool("mcp__weather__forecast", {})).toContain("no text output");
  });
});
