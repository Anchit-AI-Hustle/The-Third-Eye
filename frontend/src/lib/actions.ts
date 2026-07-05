// Actions that mutate the outside world on the user's behalf. These are never
// executed silently: the agent proposes them, the user confirms the exact
// payload, and only then does /api/act run precisely what was shown.

export const SENSITIVE_ACTIONS = new Set<string>(["send_email"]);

export function isSensitive(tool: string): boolean {
  return SENSITIVE_ACTIONS.has(tool);
}

export function summarizeAction(tool: string, args: any): string {
  switch (tool) {
    case "send_email":
      return `Send an email to ${args?.to ?? "?"} — subject "${args?.subject ?? ""}"`;
    default:
      return `Run ${tool}`;
  }
}
