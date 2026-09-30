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

const LEAD =
  /^(?:(?:hey|hi|ok|okay)\s+)?(?:jarvis\b[:,]?\s*)?(?:please\s+)?(?:(?:can|could|would)\s+you\s+)?/i;

const OPEN_CMD = /^(?:open|go to|take me to|navigate to|pull up)\s+(.+)$/i;
const EMAIL_CMD = /^(?:send|shoot|write|draft)\s+(?:an?\s+)?(?:e-?mail|mail)\b|^(?:e-?mail|mail)\s+/i;
const EMAIL_ADDR = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

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
  return parseOpen(stripped);
}

function parseOpen(text: string): DirectTurn | null {
  const m = OPEN_CMD.exec(text.replace(/[.!?]+$/, "").trim());
  if (!m) return null;
  let rest = m[1].trim().replace(/\s+please$/i, "").trim();
  if (/\band\b/i.test(rest)) return null;
  let query: string | undefined;
  const q = /^(.*?)\s+(?:for|search(?:ing)?)\s+(.+)$/i.exec(rest);
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
  const flat = text.replace(/[.!?]+$/, "").trim();
  if (!EMAIL_CMD.test(flat)) return null;
  const found = flat.match(EMAIL_ADDR);
  if (!found) return null;
  const to = found[0];
  let rest = flat
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
  return {
    kind: "email",
    text: `Ready to send that to ${to}. Confirm and it goes out.`,
    args: { action: "email", to, subject: headerSafe(subject), body },
  };
}
