/**
 * Permission classification for MCP (connector) tools.
 *
 * Built-in tools have a hand-curated sensitive list (lib/actions.ts): five names
 * that spend money or message people, each one gated behind confirm-then-act.
 * Connector tools can't work that way — they arrive at runtime from whatever
 * servers the deployment points at, so there is no list to curate. Before this,
 * every one of them ran silently: pointing MCP_SERVERS at a Gmail or Shopify
 * server handed the model the ability to send mail or create a discount with no
 * confirmation step anywhere.
 *
 * So classify by what the tool's own name says it does, and **fail closed**: a
 * verb we don't recognise is treated as a write and needs confirmation. Being
 * wrong in that direction costs one extra tap; being wrong the other way sends
 * something on the user's behalf that they never saw.
 *
 * Name-based and synchronous on purpose — this runs inside the tool-dispatch
 * loop, where a network round trip per call would be felt.
 */

const PREFIX = "mcp__";

export interface McpToolRef {
  server: string;
  tool: string;
}

/**
 * Split `mcp__Gmail__send_message` into its parts. The server name cannot
 * contain the separator (it comes from config), so the first `__` after the
 * prefix ends it and the rest — separators included — is the tool name.
 */
export function parseMcpName(qualified: string): McpToolRef | null {
  if (!qualified.startsWith(PREFIX)) return null;
  const rest = qualified.slice(PREFIX.length);
  const split = rest.indexOf("__");
  if (split <= 0) return null;
  const server = rest.slice(0, split);
  const tool = rest.slice(split + 2);
  if (!server || !tool) return null;
  return { server, tool };
}

/**
 * Verbs that only observe. Anything here runs without asking — these are the
 * calls the assistant needs to make freely to answer a question at all.
 */
const READ_VERBS = [
  "get", "list", "search", "read", "fetch", "find", "query", "describe",
  "preview", "discover", "count", "check", "view", "show", "lookup",
  "resolve", "validate", "render", "analyze", "summarize", "explore",
  "status", "download", "export", "inspect", "detail", "info", "me",
];

/**
 * Verbs that change something outside the app, or spend money. Explicit rather
 * than inferred, so the confirmation copy can be specific.
 */
const WRITE_VERBS = [
  "send", "create", "update", "delete", "remove", "post", "publish", "add",
  "set", "upload", "insert", "write", "edit", "modify", "patch", "put",
  "buy", "purchase", "pay", "charge", "order", "refund", "transfer",
  "merge", "apply", "deploy", "trash", "archive", "cancel", "revoke",
  "invite", "share", "assign", "unassign", "subscribe", "unsubscribe",
  "suppress", "unsuppress", "move", "copy", "clone", "duplicate", "import",
  "reply", "forward", "draft", "schedule", "trigger", "run", "execute",
  "exec", "activate", "deactivate", "enable", "disable", "start", "stop",
  "pause", "resume", "restore", "reset", "rebase", "revert", "generate",
  "mutation", "mutate", "connect", "disconnect", "link", "unlink",
  "grant", "approve", "reject", "resolve_thread", "label", "unlabel",
  "mark", "unmark", "bulk", "sync", "push", "commit", "release", "boost",
];

export type McpRisk = "read" | "write";

/** Split a tool name into lowercase word-ish segments. */
function segments(tool: string): string[] {
  return tool
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2") // camelCase → camel Case
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((s) => s.toLowerCase());
}

/**
 * How much trust a connector tool call needs.
 *
 * A write verb anywhere in the name wins over a read verb: `get_or_create`,
 * `search_and_update` and `list_then_delete` all mutate, and reading the first
 * word alone would wave them through.
 */
export function mcpToolRisk(qualified: string): McpRisk {
  const ref = parseMcpName(qualified);
  if (!ref) return "write"; // unparseable — fail closed
  const words = segments(ref.tool);
  if (words.some((w) => WRITE_VERBS.includes(w))) return "write";
  if (words.some((w) => READ_VERBS.includes(w))) return "read";
  return "write"; // unknown verb — fail closed
}

/** True when this connector call must be confirmed before it runs. */
export function isMcpWrite(qualified: string): boolean {
  return mcpToolRisk(qualified) === "write";
}

/** Args worth showing on a confirmation card: short, scalar, non-secret. */
const SECRET_KEY = /(token|secret|password|key|credential|authorization|cookie)/i;

function describeArgs(args: unknown): string {
  if (!args || typeof args !== "object" || Array.isArray(args)) return "";
  const parts: string[] = [];
  for (const [k, v] of Object.entries(args as Record<string, unknown>)) {
    if (SECRET_KEY.test(k)) continue;
    if (v === null || v === undefined || v === "") continue;
    if (typeof v === "object") continue; // nested payloads are too big to read on a card
    const text = String(v);
    parts.push(`${k}: ${text.length > 60 ? `${text.slice(0, 60)}…` : text}`);
    if (parts.length === 4) break;
  }
  return parts.join(", ");
}

/**
 * Human summary for the confirmation card. The user is approving a specific
 * call, so name the connector and show the arguments it would run with — an
 * opaque "Run mcp__Gmail__send_message" is not something anyone can consent to.
 */
export function summarizeMcpAction(qualified: string, args: unknown): string {
  const ref = parseMcpName(qualified);
  if (!ref) return `Run ${qualified}`;
  const action = segments(ref.tool).join(" ");
  const detail = describeArgs(args);
  return detail ? `${ref.server}: ${action} — ${detail}` : `${ref.server}: ${action}`;
}
