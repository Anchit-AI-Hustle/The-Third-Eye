// Actions that mutate the outside world on the user's behalf. These are never
// executed silently: the agent proposes them, the user confirms the exact
// payload, and only then is the action carried out — server-side via /api/act
// (e.g. send_email) or, for deep-link intents (pay/message/call), by opening
// the target app pre-filled on the confirming tap (see lib/intents.ts).

export const SENSITIVE_ACTIONS = new Set<string>([
  "send_email",
  // Deep-link intents that spend money or message people — always confirm.
  "pay", "send_whatsapp", "make_call", "send_sms",
]);

export function isSensitive(tool: string): boolean {
  return SENSITIVE_ACTIONS.has(tool);
}

export function summarizeAction(tool: string, args: any): string {
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
