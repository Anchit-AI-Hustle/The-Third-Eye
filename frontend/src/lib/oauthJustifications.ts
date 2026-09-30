/**
 * Paste-ready Google Auth Platform → Data Access justifications.
 *
 * Google groups scopes by sensitivity, one box per group, 1000 characters
 * each. Pasting a gmail.readonly blurb into the sensitive box is what
 * produced the "Request minimum scopes" rejection: that box holds
 * gmail.send, calendar.readonly and chat.spaces.readonly.
 *
 * Copy SENSITIVE_SCOPES_JUSTIFICATION, GMAIL_READONLY_JUSTIFICATION and
 * CHAT_MESSAGES_JUSTIFICATION into the matching Console fields. Tests pin
 * length and that each box names every scope it covers.
 */

export const SENSITIVE_SCOPE_LIST = [
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/chat.spaces.readonly",
] as const;

export const RESTRICTED_GMAIL_SCOPE_LIST = [
  "https://www.googleapis.com/auth/gmail.readonly",
] as const;

export const RESTRICTED_CHAT_SCOPE_LIST = [
  "https://www.googleapis.com/auth/chat.messages.readonly",
] as const;

/** Gmail restricted-scope "What features will you use?" — not Email client backup/migration. */
export const GMAIL_FEATURE_SELECTION = "Email productivity";

/**
 * Chat restricted-scope "What features will you use?".
 * Do NOT select "Chat app": this product is a web assistant using user OAuth,
 * not a bot installed into Google Chat spaces. Google's docs say leave the
 * list empty if the type is unclear so Trust & Safety classify it.
 */
export const CHAT_FEATURE_SELECTION = "(leave empty — not a Chat app)";

export const SENSITIVE_SCOPES_JUSTIFICATION = `The Third Eye (the-third-eye.anchit-tandon.com) is a personal productivity assistant. These scopes are used only after the user opts in at Settings → Connections.

gmail.send: (1) send an assistant-drafted email after the user reviews recipient, subject and body and clicks Confirm; (2) deliver a reminder or daily digest the user scheduled. Never sent on a model's initiative.

calendar.readonly: list upcoming events on the user's primary calendar when they ask about their schedule. Fetched for that request; not stored.

chat.spaces.readonly: list Chat spaces so the user can choose which ones feed Task Tracker. spaces.list requires this scope; no messages are read with it.

Why more limited scopes are insufficient: gmail.compose cannot send. calendar.freebusy has no titles or locations the briefing needs. chat.messages.readonly cannot call spaces.list, so omitting chat.spaces.readonly leaves the space picker empty.`;

export const GMAIL_READONLY_JUSTIFICATION = `gmail.readonly is used on the signed-in user's own mailbox after they connect Google:

1. Task Tracker ingest — scan unread mail from the last 2 days and extract action items, deadlines and follow-ups into tasks the user can edit or delete.
2. Assistant answers — search or summarise mail the user asked about.

Data lifecycle: bodies are fetched over TLS and processed in memory for that request or ingest pass. We do not store raw email bodies, full threads or attachments. We persist extracted task titles/due dates, Gmail message IDs already processed (dedupe), and an AES-256-GCM encrypted refresh token. Data is never sold, used for ads, or used to train generalised AI models. Content is sent to an AI provider only to complete the user's request (Limited Use).

Why gmail.metadata / gmail.labels are insufficient: they return headers, labels and subjects. Action items and deadlines live in the body. Extraction and summarisation cannot run on metadata.`;

export const CHAT_MESSAGES_JUSTIFICATION = `This is not a Google Chat bot and is not installed into Chat spaces. It is a web assistant that reads Chat on the signed-in user's behalf with user OAuth (Chat API), the same pattern as Gmail.

chat.messages.readonly is used only on spaces the user switched on in Task Tracker, to extract action items, meeting requests and follow-ups from message text.

Data lifecycle: message text is processed in memory. Raw transcripts are not stored. We persist extracted tasks, a per-space watermark (last processed timestamp), and the user's space opt-ins. Never sold, used for ads, or used to train generalised AI models.

Why more limited scopes are insufficient: chat.spaces.readonly lists spaces but cannot call spaces.messages.list. Commitments live in message text, so chat.messages.readonly is required. We do not request chat.messages (read/write) because we never post, edit or delete Chat messages.`;
