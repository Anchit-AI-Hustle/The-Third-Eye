/**
 * Paste-ready Google Auth Platform → Data Access justifications.
 *
 * Google groups scopes by sensitivity, one box per group, 1000 characters
 * each. Pasting a gmail.readonly blurb into the sensitive box is what
 * produced the "Request minimum scopes" rejection: that box holds
 * gmail.send and calendar.events.readonly.
 *
 * Copy SENSITIVE_SCOPES_JUSTIFICATION and GMAIL_READONLY_JUSTIFICATION into
 * the matching Console fields. Tests pin length and that each box names
 * every scope it covers.
 */

export const SENSITIVE_SCOPE_LIST = [
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/calendar.events.readonly",
] as const;

export const RESTRICTED_GMAIL_SCOPE_LIST = [
  "https://www.googleapis.com/auth/gmail.readonly",
] as const;

/** Gmail restricted-scope "What features will you use?" — not Email client backup/migration. */
export const GMAIL_FEATURE_SELECTION = "Email productivity";

export const SENSITIVE_SCOPES_JUSTIFICATION = `The Third Eye is a personal assistant. Both scopes act only on the signed-in user's own account, after they click Connect Google.

gmail.send (users.messages.send): 1) The user asks the Assistant to email someone; a card shows recipient, subject and body, and nothing is sent until they click Confirm. The mail then appears in their Sent folder. 2) Reminders and a daily task briefing the user switched on are emailed to the user's own address. Never sent on the app's own initiative.

calendar.events.readonly (events.list on the primary calendar): when the user asks "what's on my calendar today/this week", the Assistant lists event titles, times and locations. Not stored, never modified.

Why narrower scopes are insufficient: gmail.send is the narrowest scope that can send (gmail.compose adds drafts). calendar.freebusy returns busy blocks without titles or locations, so it can't answer the question. calendar.events.readonly replaces the broader calendar.readonly.`;

export const GMAIL_READONLY_JUSTIFICATION = `Used only on the signed-in user's own mailbox, after they click Connect Google.

1. Task Tracker: every 3 hours and when the user opens the app, unread mail from the last 2 days (max 25) is read and action items and deadlines become tasks the user can edit or delete.
2. Assistant: when the user asks ("any email from my bank?"), mail is searched and the matching message summarised.

Data lifecycle: bodies are processed in memory; raw bodies, threads and attachments are not stored. We keep extracted task titles and due dates, processed message IDs (to avoid duplicates) and an AES-256-GCM encrypted refresh token. Never sold, used for ads or to train generalised AI models; content goes to an AI provider only to complete the user's request (Limited Use).

Why gmail.metadata is insufficient: it returns headers only and cannot run search queries (q). Action items and deadlines are in the body, so extraction and search need gmail.readonly. We never modify or delete mail.`;
