import { summarizeAction } from "@/lib/actions";
import { isInternalLink, isKnownAppName, resolveAppLink } from "@/lib/appLinks";
import { planDeviceControl, protocolActions } from "@/lib/devicePlan";
import { resolveIntent } from "@/lib/intents";
import { findRecurrence, resolveTimes } from "@/lib/promptNormalizer";
import { resolveTask, type MatchableTask } from "@/lib/tools/taskMatch";

export type OpenKind = "internal" | "web" | "scheme" | "reject";

const SCHEME = /^(mailto|tel|sms|upi):/i;

/** How the client should open a side-effect URL. */
export function classifyOpenUrl(url: string): OpenKind {
  const u = (url || "").trim();
  if (!u || u.startsWith("//")) return "reject";
  if (isInternalLink(u)) return "internal";
  if (/^https?:\/\//i.test(u)) return "web";
  if (SCHEME.test(u)) return "scheme";
  return "reject";
}

const headerSafe = (s: string) => s.replace(/[\r\n]+/g, " ").replace(/ {2,}/g, " ").trim();

/** Prefilled Gmail compose. The user still presses Send. */
export function gmailComposeUrl(to: string, subject: string, body: string): string {
  const q = new URLSearchParams({
    view: "cm",
    fs: "1",
    to: headerSafe(to),
    su: headerSafe(subject),
    body,
  });
  return `https://mail.google.com/mail/?${q.toString()}`;
}

export interface DirectConfirm {
  tool: string;
  args: Record<string, unknown>;
  summary: string;
  url?: string;
  openLabel?: string;
  clientAction?: boolean;
}

export interface DirectReminder {
  title: string;
  fire_at: string;
  recurrence?: string;
}

export interface DirectTurn {
  text: string;
  sideEffects: { type: string; data: any }[];
  confirms: DirectConfirm[];
  reminders: DirectReminder[];
}

export interface DirectContext {
  tasks?: MatchableTask[];
  now?: Date;
  timezone?: string;
}

interface Act {
  text: string;
  sideEffects: DirectTurn["sideEffects"];
  confirms: DirectConfirm[];
  reminders: DirectReminder[];
  opened: boolean;
}

type Clause = Act | { kind: "miss"; text: string };

const LEAD =
  /^(?:(?:hey|hi|ok|okay)\s+)?(?:jarvis\b[:,]?\s*)?(?:please\s+)?(?:(?:can|could|would)\s+you\s+)?/i;

const OPEN_CMD = /^(open|go to|take me to|navigate to|pull up)\s+(.+)$/i;
const EMAIL_CMD = /^(?:send|shoot|write|draft)\s+(?:an?\s+)?(?:e-?mail|mail)\b|^(?:e-?mail|mail)\s+/i;
const EMAIL_ADDR = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const CMD_START =
  /^(?:open|go to|take me to|navigate to|pull up|send|shoot|write|draft|e-?mail|mail|add|create|make|new|mark|set|finish|complete|close|delete|remove|note|jot|log|record|spent|pay|transfer|upi|whatsapp|text|sms|call|dial|phone|play|directions|route|how do i get to|turn|switch|activate|start|enable|run|remind|nudge|wake|schedule|book|put|good night|good morning)\b/i;
const NON_DEST = /^(?:sleep|bed|hell|nowhere|home|work)$/i;
const SEP = /\s+(?:and then|then|and)\s+/i;

const PROTOCOL_APPS: Record<string, string[]> = {
  HOME: ["Google Home", "Nest"],
  WORK: ["Slack", "Google Calendar", "Gmail"],
  SOS: [],
  SLEEP: ["Clock"],
  WAKE: ["Google Calendar", "Gmail"],
  TRAVEL: ["Google Maps"],
};

const PROTOCOL_TEXT: Record<string, string> = {
  HOME: "Home mode is on.",
  WORK: "Work mode is on.",
  SOS: "Emergency protocol is on.",
  SLEEP: "Sleep mode is on.",
  WAKE: "Wake mode is on.",
  TRAVEL: "Travel mode is on.",
};

/**
 * Clear commands run here, before any model or memory work. A clause that is
 * not itself a complete action fails the whole turn, so mixed sentences stay
 * with the model instead of being half-executed.
 */
export function directTurn(message: string, ctx: DirectContext = {}): DirectTurn | null {
  const stripped = message.trim().replace(LEAD, "").trim();
  if (!stripped) return null;
  const clauses = splitClauses(stripped);
  if (!clauses.length) return null;

  const parts: Act[] = [];
  let carry = false;
  for (const clause of clauses) {
    const parsed = parseClause(clause, ctx, carry);
    if (!parsed) return null;
    if ("kind" in parsed) {
      if (clauses.length > 1) return null;
      return { text: parsed.text, sideEffects: [], confirms: [], reminders: [] };
    }
    parts.push(parsed);
    carry = parsed.opened;
  }

  const writes = parts.flatMap((p) => p.sideEffects.filter((s) => s.type !== "open_url"));
  const opens = parts.flatMap((p) => p.sideEffects.filter((s) => s.type === "open_url"));
  return {
    text: parts.map((p) => p.text).filter(Boolean).join(" "),
    sideEffects: [...writes, ...opens],
    confirms: parts.flatMap((p) => p.confirms),
    reminders: parts.flatMap((p) => p.reminders),
  };
}

function splitClauses(text: string): string[] {
  return text
    .split(/\s*;\s*/)
    .map((s) => s.trim())
    .filter(Boolean)
    .flatMap(splitOnJoin);
}

function splitOnJoin(text: string): string[] {
  const re = new RegExp(SEP, "gi");
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    const right = text.slice(match.index + match[0].length).trim();
    const head = right.split(SEP)[0]?.trim() ?? right;
    if (!startsCommand(right) && !isKnownAppName(head)) continue;
    const left = text.slice(0, match.index).trim();
    return [...(left ? splitOnJoin(left) : []), ...splitOnJoin(right)];
  }
  return [text];
}

function startsCommand(text: string): boolean {
  return CMD_START.test(clean(text));
}

function clean(text: string): string {
  return text.replace(/[.!?]+$/, "").replace(/\s+please$/i, "").trim();
}

function act(text: string, sideEffects: Act["sideEffects"] = [], extra?: Partial<Act>): Act {
  return { text, sideEffects, confirms: [], reminders: [], opened: false, ...extra };
}

function openAct(url: string, label: string, text?: string): Act {
  return act(text ?? `Opening ${label}.`, [{ type: "open_url", data: { url, label } }], { opened: true });
}

function parseClause(text: string, ctx: DirectContext, carry: boolean): Clause | null {
  const flat = clean(text);
  if (!flat) return null;
  return (
    parseEmail(flat) ??
    parseReminder(flat, ctx) ??
    parsePay(flat) ??
    parseExpense(flat) ??
    parseTaskCreate(flat) ??
    parseTaskMutation(flat, ctx) ??
    parseNote(flat) ??
    parseGoal(flat) ??
    parsePlay(flat) ??
    parseDirections(flat) ??
    parseOpen(flat) ??
    parseCalendar(flat, ctx) ??
    parseDevice(flat) ??
    parseProtocol(flat) ??
    parseReach(flat) ??
    (carry ? parseBareApp(flat) : null)
  );
}

function parseOpen(text: string): Act | null {
  const m = OPEN_CMD.exec(text);
  if (!m) return null;
  const verb = m[1].toLowerCase();
  let rest = m[2].trim();
  if (SEP.test(` ${rest} `) || /\band\b|\bthen\b/i.test(rest)) return null;
  let query: string | undefined;
  const q = /^(.*?)\s+(?:for|search(?:ing)?)\s+(.+)$/i.exec(rest);
  if (q) {
    rest = q[1].trim();
    query = q[2].trim();
  }
  const spoken = rest;
  rest = rest.replace(/^(?:the|my)\s+/i, "").replace(/\s+(?:page|app)$/i, "").trim();
  if (!rest) return null;
  const link = resolveAppLink(rest, query);
  if (!link.url || classifyOpenUrl(link.url) === "reject") return null;
  if (/google\.com\/search/i.test(link.url)) {
    if (verb !== "go to" && verb !== "take me to" && verb !== "navigate to") return null;
    if (NON_DEST.test(rest)) return null;
    return mapsAct(spoken);
  }
  return openAct(link.url, link.label);
}

function parseBareApp(text: string): Act | null {
  if (!isKnownAppName(text)) return null;
  const link = resolveAppLink(text.replace(/^(?:the|my)\s+/i, ""));
  if (!link.url || classifyOpenUrl(link.url) === "reject") return null;
  if (/google\.com\/search/i.test(link.url)) return null;
  return openAct(link.url, link.label);
}

function parseEmail(text: string): Act | null {
  if (!EMAIL_CMD.test(text)) return null;
  const found = text.match(EMAIL_ADDR);
  if (!found) return null;
  const to = found[0];
  const rest = text
    .replace(found[0], " ")
    .replace(/^(?:send|shoot|write|draft)\s+(?:an?\s+)?(?:e-?mail|mail)\s+(?:to\s+)?/i, " ")
    .replace(/^(?:e-?mail|mail)\s+(?:to\s+)?/i, " ")
    .replace(/\s+/g, " ")
    .trim();

  let subject = "";
  let body = "";
  const about = /^(?:about|regarding|re|subject)\s*[:-]?\s*(.+?)(?:\s+(?:saying|that says|body)\s*[:-]?\s*(.*))?$/i.exec(rest);
  if (about) {
    subject = about[1].trim();
    body = (about[2] ?? "").trim();
  } else {
    const saying = /^(?:saying|that says|body)\s*[:-]?\s*(.+)$/i.exec(rest);
    body = saying ? saying[1].trim() : rest.replace(/^[:-]\s*/, "").trim();
  }
  if (!subject) subject = (body || "Message").slice(0, 80);
  if (!body) body = subject;
  const args = { action: "email", to, subject: headerSafe(subject), body };
  return act(`Ready to send that to ${to}. Confirm and it goes out.`, [], {
    confirms: [{
      tool: "communicate",
      args,
      summary: summarizeAction("communicate", args),
      clientAction: false,
    }],
  });
}

function parseTaskCreate(text: string): Act | null {
  const m = /^(?:add|create|make|new)\s+(?:an?\s+)?(?:(urgent|high|low)\s+)?(?:task|to-?do)\b[:\s-]*(?:(?:to|for|called|named|titled)\s+)?(.+)$/i.exec(text);
  if (!m) return null;
  const title = m[2].replace(/^[:\s-]+/, "").trim();
  if (!title) return null;
  const priority = (m[1] ?? "medium").toLowerCase();
  return act(`Added the task “${title}”.`, [{
    type: "task_create",
    data: { title, priority, status: "todo" },
  }]);
}

function parseTaskMutation(text: string, ctx: DirectContext): Clause | null {
  const done = /^(?:mark|set)\s+(.+?)\s+(?:as\s+)?(?:done|complete[d]?|finished)$/i.exec(text)
    ?? /^(?:finish|complete|close)\s+(?:the\s+)?task\s+(.+)$/i.exec(text);
  const del = /^(?:delete|remove)\s+(?:the\s+)?task\s+(.+)$/i.exec(text);
  if (!done && !del) return null;
  const title = (done?.[1] ?? del?.[1] ?? "").replace(/^(?:the|my)\s+/i, "").replace(/\s+task$/i, "").trim();
  if (!title) return null;
  const found = resolveTask(ctx.tasks ?? [], { title });
  if (!found.task) {
    const text = /matches \d+ tasks/.test(found.message)
      ? "That matches more than one task, so nothing was changed."
      : `No task matching “${title}” is in the tracker, so nothing was changed.`;
    return { kind: "miss", text };
  }
  if (del) {
    return act(`Deleted “${found.task.title}”.`, [{
      type: "task_delete",
      data: { id: found.task.id },
    }]);
  }
  return act(`Marked “${found.task.title}” done.`, [{
    type: "task_update",
    data: { id: found.task.id, patch: { status: "done" } },
  }]);
}

function parseNote(text: string): Act | null {
  const m = /^(?:make|save|add|create)\s+(?:a\s+)?note\b[:\s-]*(?:(?:called|titled|about|that)\s+)?(.+)$/i.exec(text)
    ?? /^(?:note|jot|write)\s+(?:this\s+)?down\s*:?\s*(.+)$/i.exec(text);
  if (!m) return null;
  const content = m[1].trim();
  if (!content) return null;
  const title = content.length > 80 ? `${content.slice(0, 77)}…` : content;
  return act(`Saved a note: “${title}”.`, [{ type: "note_create", data: { title, content } }]);
}

function parseGoal(text: string): Act | null {
  const m = /^(?:add|create|set|make)\s+(?:a\s+)?goal\b[:\s-]*(?:(?:to|called|named|titled)\s+)?(.+)$/i.exec(text);
  if (!m) return null;
  const title = m[1].trim();
  if (!title) return null;
  return act(`Added the goal “${title}”.`, [{
    type: "goal_create",
    data: { title, category: "Personal", target: 100, unit: "%", current: 0 },
  }]);
}

function parseExpense(text: string): Act | null {
  if (!/^(?:log|add|record)\s+(?:an?\s+)?expense\b|^(?:i\s+)?spent\b/i.test(text)) return null;
  const tagged = /(?:₹|rs\.?|inr)\s*(\d+(?:\.\d+)?)|(\d+(?:\.\d+)?)\s*(?:₹|rs\.?|rupees|inr)/i.exec(text);
  const bare = /(?:₹|rs\.?|inr|rupees)/i.test(text) ? null : /(\d+(?:\.\d+)?)/.exec(text);
  const amount = Number(tagged?.[1] || tagged?.[2] || bare?.[1]);
  if (!amount || amount <= 0) return null;
  const note = text
    .replace(/^(?:log|add|record)\s+(?:an?\s+)?expense\b|(?:i\s+)?spent\b/i, " ")
    .replace(/(?:₹|rs\.?|inr)\s*\d+(?:\.\d+)?|\d+(?:\.\d+)?\s*(?:₹|rs\.?|rupees|inr)|\d+(?:\.\d+)?/i, " ")
    .replace(/\b(?:of|on|for|rupees|inr)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return act(`Logged ₹${amount}${note ? ` for ${note}` : ""}.`, [{
    type: "expense_create",
    data: { amount, category: "Other", ...(note ? { note } : {}) },
  }]);
}

function parsePay(text: string): Act | null {
  const m = /^(?:pay|transfer|upi)\s+(?:₹|rs\.?|inr\s*)?(\d+(?:\.\d+)?)(?:\s*rupees)?\s+to\s+(\S+@\S+)(?:\s+(?:for|note)\s+(.+))?$/i.exec(text);
  if (!m) return null;
  const amount = Number(m[1]);
  if (!amount) return null;
  const args = {
    amount,
    vpa: m[2],
    ...(m[3] ? { note: m[3].trim() } : {}),
    currency: "INR",
  };
  const intent = resolveIntent("pay", args);
  if (!intent) return null;
  return act(`Ready to pay ₹${amount} to ${args.vpa}. Confirm and your UPI app opens.`, [], {
    confirms: [{
      tool: "pay",
      args,
      summary: summarizeAction("pay", args),
      url: intent.url,
      openLabel: intent.openLabel,
      clientAction: true,
    }],
  });
}

function parseReach(text: string): Act | null {
  const wa = /^(?:send\s+(?:a\s+)?)?whatsapp(?:\s+message)?\s+(?:to\s+)?(?:(\+?\d[\d\s()-]{5,})\s+)?(?:saying|that|:)?\s*(.+)$/i.exec(text);
  if (wa) {
    const message = wa[2].trim();
    if (!message || /^(?:open|web)$/i.test(message)) return null;
    const phone = (wa[1] ?? "").replace(/[^\d+]/g, "");
    const url = phone
      ? `https://wa.me/${phone.replace(/^\+/, "")}?text=${encodeURIComponent(message)}`
      : `https://wa.me/?text=${encodeURIComponent(message)}`;
    return openAct(url, "WhatsApp", "Opening WhatsApp with your message.");
  }
  const sms = /^(?:text|sms)\s+(?:to\s+)?(\+?\d[\d\s()-]{5,})(?:\s+(?:saying|that|:)\s*|\s+)(.+)$/i.exec(text);
  if (sms) {
    const number = sms[1].replace(/[^\d+]/g, "");
    const body = sms[2].trim();
    return openAct(`sms:${number}${body ? `?body=${encodeURIComponent(body)}` : ""}`, "SMS", `Opening messages for ${number}.`);
  }
  const call = /^(?:call|dial|phone)\s+(\+?\d[\d\s()-]{5,})$/i.exec(text);
  if (call) {
    const number = call[1].replace(/[^\d+]/g, "");
    if (number.replace(/\D/g, "").length < 6) return null;
    return openAct(`tel:${number}`, "Call", `Opening the dialer for ${number}.`);
  }
  return null;
}

function parseDirections(text: string): Act | null {
  const m = /^(?:(?:get\s+)?directions|route)\s+to\s+(.+)$/i.exec(text)
    ?? /^how\s+do\s+i\s+get\s+to\s+(.+)$/i.exec(text);
  if (!m) return null;
  return mapsAct(m[1].trim());
}

function mapsAct(destination: string): Act | null {
  const intent = resolveIntent("navigate_maps", { destination });
  if (!intent) return null;
  return openAct(intent.url, intent.label, intent.label + ".");
}

function parsePlay(text: string): Act | null {
  const m = /^play\s+(.+?)\s+on\s+(spotify|youtube music|yt music|apple music)$/i.exec(text);
  if (!m) return null;
  const query = m[1].trim();
  const service = m[2].toLowerCase();
  const q = encodeURIComponent(query);
  if (service === "spotify") return openAct(`https://open.spotify.com/search/${q}`, "Spotify", `Opening Spotify for “${query}”.`);
  if (service === "apple music") return openAct(`https://music.apple.com/search?term=${q}`, "Apple Music", `Opening Apple Music for “${query}”.`);
  return openAct(`https://music.youtube.com/search?q=${q}`, "YouTube Music", `Opening YouTube Music for “${query}”.`);
}

function parseCalendar(text: string, ctx: DirectContext): Act | null {
  const m = /^(?:add|put)\s+(.+?)\s+(?:on|to|in)\s+(?:my\s+)?calendar$/i.exec(text)
    ?? /^(?:schedule|book|add|create)\s+(?:a\s+)?(?:meeting|event|appointment)\b[:\s-]*(?:(?:called|titled|for|about|with)\s+)?(.+)$/i.exec(text);
  if (!m) return null;
  const title = m[1].replace(/\s+(?:on|to|in)\s+(?:my\s+)?calendar$/i, "").trim();
  if (!title) return null;
  const when = resolveTimes(text, ctx.now ?? new Date(), ctx.timezone ?? "UTC")[0];
  const dates = when ? calendarSpan(when.iso) : undefined;
  const intent = resolveIntent("add_calendar_event", { title, ...(dates ?? {}) });
  if (!intent) return null;
  return openAct(intent.url, intent.label, `${intent.label}.`);
}

function calendarSpan(iso: string): { start: string; end: string } | undefined {
  const start = new Date(iso);
  if (Number.isNaN(start.getTime())) return undefined;
  const end = new Date(start.getTime() + 3_600_000);
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  return { start: fmt(start), end: fmt(end) };
}

function parseDevice(text: string): Act | null {
  const m = /^(?:turn|switch)\s+(on|off)\s+(?:the\s+|my\s+)?(.+)$/i.exec(text)
    ?? /^(?:turn|switch)\s+(?:the\s+|my\s+)?(.+?)\s+(on|off)$/i.exec(text);
  if (!m) return null;
  const onOff = (m[1].toLowerCase() === "on" || m[1].toLowerCase() === "off" ? m[1] : m[2]).toLowerCase();
  const device = (m[1].toLowerCase() === "on" || m[1].toLowerCase() === "off" ? m[2] : m[1]).trim();
  if (!device || /^(?:on|off)$/i.test(device)) return null;
  const plan = planDeviceControl(onOff, device);
  if (!plan.sideEffect) return null;
  const where = plan.kind === "smarthome" ? device : "this device";
  return act(`Queued ${onOff} for ${where}.`, [plan.sideEffect]);
}

function parseProtocol(text: string): Act | null {
  const named = /^(?:activate|start|enable|run)\s+(?:the\s+)?(home|work|sos|sleep|wake|travel)(?:\s+(?:protocol|mode))?$/i.exec(text);
  const protocol = named?.[1]?.toUpperCase()
    ?? (/^good night$/i.test(text) ? "SLEEP" : /^good morning$/i.test(text) ? "WAKE" : "");
  if (!protocol || !PROTOCOL_TEXT[protocol]) return null;
  const sideEffects: Act["sideEffects"] = [];
  if (protocol === "SOS") sideEffects.push({ type: "open_url", data: { url: "tel:112", label: "Emergency 112" } });
  for (const app of PROTOCOL_APPS[protocol] ?? []) {
    const link = resolveAppLink(app);
    if (!link.url || /google\.com\/search/i.test(link.url)) continue;
    sideEffects.push({ type: "open_url", data: { url: link.url, label: link.label } });
  }
  for (const step of protocolActions(protocol)) {
    const plan = planDeviceControl(step.action, step.device, step.value);
    if (plan.sideEffect) sideEffects.push(plan.sideEffect);
  }
  return act(PROTOCOL_TEXT[protocol], sideEffects);
}

function parseReminder(text: string, ctx: DirectContext): Act | null {
  if (!/^(?:remind me|set (?:a |an )?reminder(?: for me)?|nudge me|wake me)\b/i.test(text)) return null;
  const times = resolveTimes(text, ctx.now ?? new Date(), ctx.timezone ?? "UTC");
  const when = times.find((t) => t.iso);
  if (!when) return null;
  let title = text.replace(/^(?:remind me|set (?:a |an )?reminder(?: for me)?|nudge me|wake me)\b/i, " ");
  if (when.phrase) title = title.replace(when.phrase, " ");
  title = title.replace(/^(?:\s*(?:to|about|up)\s+)+/i, "").replace(/\s+/g, " ").trim();
  if (!title) return null;
  const recurrence = findRecurrence(text);
  return act(`Setting a reminder: ${title}.`, [], {
    reminders: [{ title, fire_at: when.iso, ...(recurrence ? { recurrence } : {}) }],
  });
}
