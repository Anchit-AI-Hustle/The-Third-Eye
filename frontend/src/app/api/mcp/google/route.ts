import { timingSafeEqual } from "crypto";
import type { NextRequest } from "next/server";
import { getGoogleAccessToken, googleCapabilities } from "@/lib/googleToken";
import {
  calendarListEvents,
  gmailReadMessage,
  gmailSearch,
  gmailSend,
  type GoogleResult,
} from "@/lib/google/api";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * In-repo MCP server exposing the user's own Gmail and Calendar.
 *
 * Every other connector would need its own OAuth app registered by the
 * deployer. This one needs none: sign-in already collects the Google grant, so
 * the same refresh token that powers the reminder cron powers these tools —
 * nobody is asked for anything new.
 *
 * It is a real MCP server (JSON-RPC over HTTP), not a shortcut, so the existing
 * client discovers it like any other, its writes go through the same
 * confirm-then-act gate as any other connector, and pointing a different MCP
 * client at it would work.
 *
 * ## Why this endpoint is locked down
 *
 * It mints Google access tokens for an arbitrary named user, so an open version
 * of it would be a public read-and-send proxy for every mailbox in the
 * database. Two things must both hold:
 *
 *   1. `MCP_INTERNAL_SECRET` is configured and the caller presents it. Unset
 *      disables the endpoint entirely rather than leaving it open — failing
 *      closed is the only safe default for a route like this.
 *   2. The caller names the user in `x-mcp-user`. The MCP client sends this
 *      only to servers marked `internal` in MCP_SERVERS.
 *
 * The secret is compared in constant time; a length-varying compare leaks it a
 * byte at a time to anyone who can measure the response.
 */

interface JsonRpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: any;
}

const SERVER_INFO = { name: "google", version: "1.0.0" };
const PROTOCOL_VERSION = "2024-11-05";

const TOOLS = [
  {
    name: "gmail_search",
    description:
      "Search the signed-in user's Gmail using Gmail query syntax (e.g. 'from:vendor@x.com is:unread', " +
      "'subject:invoice newer_than:7d'). Returns sender, subject, date and snippet for each match. " +
      "Read-only. Use gmail_read_message with a returned id to get a full body.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Gmail search query. Defaults to is:unread." },
        max_results: { type: "number", description: "How many messages to return (1-25, default 5)." },
      },
    },
  },
  {
    name: "gmail_read_message",
    description:
      "Read one Gmail message in full, including its plain-text body, by the id returned from gmail_search. Read-only.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "Gmail message id." } },
      required: ["id"],
    },
  },
  {
    name: "gmail_send",
    description:
      "Send an email from the signed-in user's Gmail account. This sends for real and cannot be undone, " +
      "so it is confirmed with the user before it runs.",
    inputSchema: {
      type: "object",
      properties: {
        to: { type: "string", description: "Recipient email address." },
        subject: { type: "string", description: "Subject line." },
        body: { type: "string", description: "Plain-text body." },
      },
      required: ["to", "body"],
    },
  },
  {
    name: "calendar_list_events",
    description:
      "List upcoming events from the signed-in user's primary Google Calendar, soonest first. Read-only.",
    inputSchema: {
      type: "object",
      properties: {
        days_ahead: { type: "number", description: "How far ahead to look, in days (1-365, default 7)." },
        max_results: { type: "number", description: "How many events to return (1-50, default 10)." },
      },
    },
  },
];

export async function POST(req: NextRequest) {
  const secret = (process.env.MCP_INTERNAL_SECRET ?? "").trim();
  // Unset means "not deployed", not "no auth required".
  if (!secret) return rpcError(null, -32000, "This MCP server is not configured (MCP_INTERNAL_SECRET unset).", 501);
  if (!presentedSecretMatches(req.headers.get("x-mcp-secret"), secret)) {
    return rpcError(null, -32001, "Unauthorized.", 401);
  }

  let body: JsonRpcRequest;
  try {
    body = (await req.json()) as JsonRpcRequest;
  } catch {
    return rpcError(null, -32700, "Parse error.", 400);
  }

  const id = body.id ?? null;

  switch (body.method) {
    case "initialize":
      return rpcResult(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
      });

    case "notifications/initialized":
      return rpcResult(id, {});

    case "tools/list":
      return rpcResult(id, { tools: TOOLS });

    case "tools/call":
      return handleCall(req, id, body.params);

    default:
      return rpcError(id, -32601, `Method not found: ${body.method ?? "(none)"}`);
  }
}

function presentedSecretMatches(presented: string | null, expected: string): boolean {
  if (!presented) return false;
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  // timingSafeEqual throws on a length mismatch, which would itself leak length.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

async function handleCall(req: NextRequest, id: string | number | null, params: any) {
  const name = params?.name as string | undefined;
  const args = (params?.arguments ?? {}) as Record<string, any>;
  if (!name) return rpcError(id, -32602, "Missing tool name.");

  const email = req.headers.get("x-mcp-user")?.trim();
  if (!email) return toolText(id, "No user was named for this call, so there is no mailbox to act on.", true);

  const grant = await getGoogleAccessToken(email).catch(() => null);
  if (!grant?.accessToken) {
    return toolText(
      id,
      "Google isn't connected for this account. Signing in with Google normally grants it — sign out and back in, " +
        'or use Settings → Connections → "Connect Google".',
      true,
    );
  }

  // Holding a token is not the same as being allowed to use it: the consent
  // screen lets people decline individual boxes. Check the granted scope for
  // this specific tool so a declined permission reads as a permission problem
  // rather than an unexplained Google 403.
  const can = googleCapabilities(grant.scope);
  const needed: Record<string, { allowed: boolean; label: string }> = {
    gmail_search: { allowed: can.gmailRead, label: "read your mail" },
    gmail_read_message: { allowed: can.gmailRead, label: "read your mail" },
    gmail_send: { allowed: can.gmailSend, label: "send mail" },
    calendar_list_events: { allowed: can.calendarRead, label: "read your calendar" },
  };
  const gate = needed[name];
  if (!gate) return rpcError(id, -32602, `Unknown tool: ${name}`);
  if (!gate.allowed) {
    return toolText(
      id,
      `Permission to ${gate.label} was not granted. Reconnect Google from Settings → Connections and allow it.`,
      true,
    );
  }

  const token = grant.accessToken;

  switch (name) {
    case "gmail_search":
      return fromResult(id, await gmailSearch(token, args.query || "is:unread", Number(args.max_results) || 5));
    case "gmail_read_message":
      if (!args.id) return toolText(id, "A message id is required.", true);
      return fromResult(id, await gmailReadMessage(token, String(args.id)));
    case "gmail_send":
      return fromResult(
        id,
        await gmailSend(token, String(args.to ?? ""), String(args.subject ?? ""), String(args.body ?? "")),
      );
    case "calendar_list_events":
      return fromResult(
        id,
        await calendarListEvents(token, Number(args.days_ahead) || 7, Number(args.max_results) || 10),
      );
    default:
      return rpcError(id, -32602, `Unknown tool: ${name}`);
  }
}

/** Turn a helper's typed result into an MCP content block. */
function fromResult<T>(id: string | number | null, result: GoogleResult<T>) {
  if (!result.ok) return toolText(id, result.error, true);
  return toolText(id, JSON.stringify(result.data, null, 2), false);
}

function toolText(id: string | number | null, text: string, isError: boolean) {
  return rpcResult(id, { content: [{ type: "text", text }], isError });
}

function rpcResult(id: string | number | null, result: unknown, status = 200) {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id, result }), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function rpcError(id: string | number | null, code: number, message: string, status = 200) {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } }), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
