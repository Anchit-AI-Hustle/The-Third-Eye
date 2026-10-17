// Whether the user's own message asks for this world-changing action right now.
// When it does, the action runs without a confirm card: the user already said
// so. Anything else (JARVIS deciding on its own, an instruction found inside an
// email or web page) still goes through confirmation.

const NOT_NOW = /\b(don'?t|do not|never|without) (send|sending|post|posting|publish|publishing)\b|\b(draft|preview|just write)\b/i;

const VERBS: Record<string, RegExp> = {
  communicate: /\b(send|email|e-mail|mail|reply|respond|forward)\b/i,
  anchor: /\b(run|drop|publish|post|queue|release|mix|rehearse)\b/i,
  build_app: /\b(build|make|create|code|ship)\b[\s\S]*\b(app|site|website|page|tool|game|dashboard)\b/i,
};
const CONNECTOR = /\b(send|post|message|create|add|update|edit|delete|remove|book|schedule|publish|reply|move|archive|invite|assign|close|merge|upload)\b/i;

export function explicitlyRequested(userMessage: string, tool: string, args: Record<string, unknown> = {}): boolean {
  const text = userMessage.trim();
  if (!text || NOT_NOW.test(text) || /\?\s*$/.test(text)) return false;
  if (tool === "communicate" && (args.action ?? "email") !== "email") return false;
  const verb = VERBS[tool] ?? (tool.startsWith("mcp__") ? CONNECTOR : null);
  return !!verb && verb.test(text);
}

/** Settings switch: confirm every world-changing action, even ones asked for directly. */
export const CONFIRM_ACTIONS_KEY = "jarvis_confirm_actions";
export function confirmActionsOn(): boolean {
  try { return localStorage.getItem(CONFIRM_ACTIONS_KEY) === "1"; } catch { return false; }
}
