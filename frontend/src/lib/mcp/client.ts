// MCP (Model Context Protocol) client — lets the assistant call tools it does
// not implement itself.
//
// Until now every capability was a hand-written case in the chat route's tool
// dispatch: 33 tools, each one a code change and a deploy. An MCP server is a
// process that publishes its own tools over JSON-RPC, so pointing at one adds
// its whole toolset without touching this codebase.
//
// Scope, deliberately narrow:
//
//   * HTTP transport only. The route is serverless, so there is no process to
//     hold a stdio pipe open between requests.
//   * Servers are configured by whoever deploys the app (MCP_SERVERS), never by
//     an end user. A user-supplied URL would let a chat message point the server
//     at anything reachable from the deployment — SSRF with the model as the
//     confused deputy.
//   * Two methods, tools/list and tools/call. Prompts and resources can follow
//     if something needs them.

const PREFIX = "mcp__";
const LIST_TIMEOUT_MS = 4_000;
const CALL_TIMEOUT_MS = 25_000;
// Tool lists change rarely and every chat request needs them, so re-discovering
// per request would add a round trip per server to the user's latency.
const CACHE_TTL_MS = 60_000;

export interface McpServer {
  name: string;
  url: string;
  headers?: Record<string, string>;
  /**
   * Marks a server as first-party — one this deployment owns, such as the
   * in-repo Google server at /api/mcp/google. Only these are told *which user*
   * a call is for (`x-mcp-user`), because that server acts on the user's own
   * stored Google grant and cannot work without knowing whose.
   *
   * Third-party servers never receive it. Broadcasting the signed-in user's
   * email to every configured endpoint would leak identity to anyone the
   * deployer points MCP_SERVERS at — a far worse trade than one connector not
   * knowing who is asking.
   */
  internal?: boolean;
}

interface McpTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

let cache: { at: number; tools: Array<{ server: McpServer; tool: McpTool }> } | null = null;

/**
 * Configured servers, as JSON in MCP_SERVERS:
 *   [{"name":"weather","url":"https://…/mcp","headers":{"Authorization":"Bearer …"}}]
 * Malformed config disables MCP rather than breaking chat.
 */
export function configuredServers(): McpServer[] {
  const raw = process.env.MCP_SERVERS?.trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (s): s is McpServer =>
          !!s && typeof s.name === "string" && typeof s.url === "string" && /^https?:\/\//.test(s.url),
      )
      .map((s) => ({ ...s, internal: s.internal === true }));
  } catch {
    return [];
  }
}

async function rpc(
  server: McpServer,
  method: string,
  params: unknown,
  timeoutMs: number,
  userEmail?: string,
): Promise<any> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(server.url, {
      method: "POST",
      signal: ctl.signal,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        ...(server.headers ?? {}),
        // Identity goes to first-party servers only — see McpServer.internal.
        ...(server.internal && userEmail ? { "x-mcp-user": userEmail } : {}),
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }),
    });
    if (!res.ok) throw new Error(`${server.name}: HTTP ${res.status}`);
    const body = await res.json();
    if (body.error) throw new Error(`${server.name}: ${body.error.message ?? "rpc error"}`);
    return body.result;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Every tool across every configured server. One unreachable server costs its
 * own tools, not the whole list — a broken MCP endpoint must not take chat down
 * with it.
 */
export async function discoverTools(): Promise<Array<{ server: McpServer; tool: McpTool }>> {
  const servers = configuredServers();
  if (!servers.length) return [];
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.tools;

  const results = await Promise.allSettled(
    servers.map(async (server) => {
      const result = await rpc(server, "tools/list", {}, LIST_TIMEOUT_MS);
      const tools: McpTool[] = Array.isArray(result?.tools) ? result.tools : [];
      return tools.map((tool) => ({ server, tool }));
    }),
  );

  const tools = results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
  for (const r of results) {
    if (r.status === "rejected") console.error("mcp: tools/list failed:", r.reason);
  }
  cache = { at: Date.now(), tools };
  return tools;
}

/** Namespaced so an MCP tool can never shadow a built-in one. */
export function qualifiedName(serverName: string, toolName: string): string {
  return `${PREFIX}${serverName}__${toolName}`;
}

export function isMcpTool(name: string): boolean {
  return name.startsWith(PREFIX);
}

/**
 * Declarations in Gemini's functionDeclarations shape, ready to concatenate
 * onto the built-in ones.
 */
export async function mcpToolDeclarations(): Promise<
  Array<{ name: string; description: string; parameters: Record<string, unknown> }>
> {
  const found = await discoverTools();
  return found.map(({ server, tool }) => ({
    name: qualifiedName(server.name, tool.name),
    description: tool.description ?? `${tool.name} (via ${server.name})`,
    parameters: (tool.inputSchema as Record<string, unknown>) ?? { type: "OBJECT", properties: {} },
  }));
}

/**
 * Runs an MCP tool by its qualified name. Returns a string because that is what
 * the tool dispatch hands back to the model; failures are returned as text
 * rather than thrown, so one bad tool call does not end the conversation.
 */
export async function callMcpTool(qualified: string, args: unknown, userEmail?: string): Promise<string> {
  const found = await discoverTools();
  const match = found.find(({ server, tool }) => qualifiedName(server.name, tool.name) === qualified);
  if (!match) return `No MCP tool named ${qualified} is available.`;

  try {
    const result = await rpc(
      match.server,
      "tools/call",
      { name: match.tool.name, arguments: args ?? {} },
      CALL_TIMEOUT_MS,
      userEmail,
    );
    // MCP returns content blocks; the model only needs the text.
    const content = Array.isArray(result?.content) ? result.content : [];
    const text = content
      .filter((c: any) => c?.type === "text" && typeof c.text === "string")
      .map((c: any) => c.text)
      .join("\n")
      .trim();
    if (result?.isError) return `${match.tool.name} reported an error: ${text || "no detail given"}`;
    return text || `${match.tool.name} returned no text output.`;
  } catch (err) {
    return `Could not reach ${match.server.name}: ${err instanceof Error ? err.message : String(err)}`;
  }
}

/** Test seam — discovery is cached for a minute, which tests must not inherit. */
export function resetMcpCache() {
  cache = null;
}
