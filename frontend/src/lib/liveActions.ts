import { isInternalLink, resolveAppLink } from "@/lib/appLinks";

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

export interface OpenSideEffect {
  type: "open_url";
  data: { url: string; label: string };
}

export type DirectTurn =
  | { kind: "open"; text: string; sideEffects: OpenSideEffect[] }
  | { kind: "email"; text: string; args: { action: "email"; to: string; subject: string; body: string } };

/** Platforms the assistant can connect and then read, the same way Settings → Connections does. */
export const CONNECTORS: { id: string; label: string; href: string; test: RegExp }[] = [
  { id: "github", label: "GitHub", href: "/api/connect/github", test: /git\s*hub/i },
  { id: "google", label: "Google", href: "/api/connect/google", test: /\b(google|gmail|g\s*mail|calendar)\b/i },
];

const LEAD =
  /^(?:(?:hey|hi|ok|okay)\s+)?(?:jarvis\b[:,]?\s*)?(?:please\s+)?(?:(?:can|could|would)\s+you\s+)?/i;

const OPEN_CMD = /^(?:open|go to|take me to|navigate to|pull up)\s+(.+)$/i;
const CONNECT_CMD = /^(?:connect|link|hook up)(?:\s+me)?(?:\s+to)?(?:\s+(?:my|the))?\s+(.+)$/i;
const EMAIL_CMD = /^(?:send|shoot|write|draft|compose)\s+(?:an?\s+)?(?:e-?mail|mail)\b|^(?:e-?mail|mail)\s+/i;
const EMAIL_ADDR = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

/** Every well-formed address in a To header. Comma-separated is what Gmail sends. */
export function emailRecipients(raw: string): string[] {
  const parts = raw.split(/[,;]/).map((part) => part.trim());
  if (!parts.every((addr) => /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(addr))) return [];
  return [...new Set(parts)];
}

/**
 * Commands that must not wait on a model round-trip. "Open my tasks" and
 * "email ada@x.com …" were dying whenever Gemini was down or the model
 * called a tool name that does not exist.
 */
export function directTurn(message: string): DirectTurn | null {
  const stripped = message.trim().replace(LEAD, "").trim();
  if (!stripped) return null;
  const email = parseEmail(stripped);
  if (email) return email;
  const connect = parseConnect(stripped);
  if (connect) return connect;
  return parseOpen(stripped);
}

function parseConnect(text: string): DirectTurn | null {
  const m = CONNECT_CMD.exec(text.replace(/[.!?]+$/, "").trim());
  if (!m) return null;
  const name = m[1].trim();
  const hit = CONNECTORS.find((c) => c.test.test(name));
  if (!hit) return null;
  return {
    kind: "open",
    text: `Connecting ${hit.label}. Approve access on the next screen and I can use it directly.`,
    sideEffects: [{ type: "open_url", data: { url: hit.href, label: `Connect ${hit.label}` } }],
  };
}

function parseOpen(text: string): DirectTurn | null {
  const m = OPEN_CMD.exec(text.replace(/[.!?]+$/, "").trim());
  if (!m) return null;
  let rest = m[1].trim().replace(/\s+please$/i, "").trim();
  if (/\band\b/i.test(rest)) return null;
  let query: string | undefined;
  const q = /^(.*?)\s+(?:for|search(?:ing)?)\s+([\s\S]+)$/i.exec(rest);
  if (q) {
    rest = q[1].trim();
    query = q[2].trim();
  }
  rest = rest.replace(/^(?:the|my)\s+/i, "").replace(/\s+(?:page|app)$/i, "").trim();
  if (!rest) return null;
  const link = resolveAppLink(rest, query);
  if (!link.url || classifyOpenUrl(link.url) === "reject") return null;
  // Unknown names fall through to a Google search. That is a guess, not a
  // page the user named — leave it for the model instead of navigating away.
  if (/google\.com\/search/i.test(link.url)) return null;
  return {
    kind: "open",
    text: `Opening ${link.label}.`,
    sideEffects: [{ type: "open_url", data: { url: link.url, label: link.label } }],
  };
}

function parseEmail(text: string): DirectTurn | null {
  if (!EMAIL_CMD.test(text)) return null;
  let rest = text
    .replace(/^(?:send|shoot|write|draft|compose)\s+(?:an?\s+)?(?:e-?mail|mail)\s+(?:to\s+)?/i, "")
    .replace(/^(?:e-?mail|mail)\s+(?:to\s+)?/i, "")
    .trim();
  const recipients: string[] = [];
  while (true) {
    const found = EMAIL_ADDR.exec(rest);
    if (!found || found.index !== 0) return null;
    recipients.push(found[0]);
    rest = rest.slice(found[0].length).trimStart();
    const separator = /^(?:[,;]\s*(?:and\s+)?|(?:and|&)\s+)/i.exec(rest);
    if (!separator) break;
    const next = rest.slice(separator[0].length);
    if (EMAIL_ADDR.exec(next)?.index !== 0) return null;
    rest = next;
  }
  const to = [...new Set(recipients)].join(", ");
  // Only bypass the model for explicit content, not prose-writing instructions.
  if (!/^(?:about|regarding|re|subject|saying|that(?: says)?|body)\b|^[:-]/i.test(rest)) return null;

  let subject = "";
  let body = "";
  const about = /^(?:about|regarding|re|subject)\s*[:-]?\s*([\s\S]+?)(?:\s+(?:saying|that(?: says)?|body)\s*[:-]?\s*([\s\S]*))?$/i.exec(rest);
  if (about) {
    subject = about[1].trim();
    body = (about[2] ?? "").trim();
  } else {
    const saying = /^(?:saying|that(?: says)?|body)\s*[:-]?\s*([\s\S]+)$/i.exec(rest);
    body = saying ? saying[1].trim() : rest.replace(/^[:-]\s*/, "").trim();
  }
  if (!subject && !body) return null;
  if (!subject) subject = body.slice(0, 80);
  if (!body) body = subject;
  return {
    kind: "email",
    text: `Review the email to ${to}, then confirm to send.`,
    args: { action: "email", to, subject: headerSafe(subject), body },
  };
}
