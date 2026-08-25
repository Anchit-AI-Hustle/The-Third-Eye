// Actions that mutate the outside world on the user's behalf. These are never
// executed silently: the agent proposes them, the user confirms the exact
// payload, and only then is the action carried out — server-side via /api/act
// (e.g. send_email) or, for deep-link intents (pay/message/call), by opening
// the target app pre-filled on the confirming tap (see lib/intents.ts).

import { isMcpWrite, summarizeMcpAction } from "@/lib/mcp/permissions";

/** Local copy of the namespace test — keeps this module free of the MCP client. */
function isMcpTool(tool: string): boolean {
  return tool.startsWith("mcp__");
}

export const SENSITIVE_ACTIONS = new Set<string>([
  "send_email",
  // Deep-link intents that spend money or message people — always confirm.
  "pay", "send_whatsapp", "make_call", "send_sms",
]);

/**
 * Connector (MCP) tools can't appear in the list above — they arrive at runtime
 * from whatever servers the deployment is pointed at. Their write calls are
 * classified by name and confirmed the same way, so enabling a connector never
 * silently grants the model the ability to send, buy or delete on the user's
 * behalf. See lib/mcp/permissions.ts.
 */
export function isSensitive(tool: string): boolean {
  if (SENSITIVE_ACTIONS.has(tool)) return true;
  if (isMcpTool(tool)) return isMcpWrite(tool);
  return false;
}

export function summarizeAction(tool: string, args: any): string {
  if (isMcpTool(tool)) return summarizeMcpAction(tool, args);
  switch (tool) {
    case "send_email":
      return `Send an email to ${args?.to ?? "?"} — subject "${args?.subject ?? ""}"`;
    case "pay":
      return `Pay ${args?.amount ?? "?"} to ${args?.name ?? args?.vpa ?? "?"}${args?.note ? ` — "${args.note}"` : ""}`;
    case "send_whatsapp":
      return `WhatsApp ${args?.to ?? "a contact"}: "${args?.message ?? ""}"`;
    case "make_call":
      return `Call ${args?.number ?? "?"}`;
    case "send_sms":
      return `Text ${args?.number ?? "?"}: "${args?.message ?? ""}"`;
    default:
      return `Run ${tool}`;
  }
}
