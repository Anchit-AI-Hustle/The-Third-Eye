// Conversation-source registry for the Task Tracker.
//
// Every entry here is a source we can read via a SANCTIONED path — an official
// API with the user's own OAuth grant, or a file the user exports themselves.
// Consistent with lib/apps/registry.ts, we never scrape or automate a logged-in
// third-party account, so "read my WhatsApp Web session" is not a connector and
// never will be. Where a platform has no lawful read path, it stays listed with
// `reach: "none"` and a plain-language reason, so the picker can show WHY it is
// unavailable instead of silently omitting it and looking broken.
//
// A connector's job is to produce messages for the existing ingest contract in
// lib/ingest.ts: dedupe on (user, source, messageId) via `ingest_ledger`, extract
// with extractMeetingTasks(), then saveExtractedTasks() with sourceType /
// sourceRefId / sourceDetail / sourceLink. Those last two are what make a tracker
// row say "which chat did this come from".

export type ConnectorId =
  | "google-chat"
  | "slack"
  | "teams"
  | "telegram"
  | "discord"
  | "whatsapp-business"
  | "instagram"
  | "whatsapp-export"
  | "snapchat"
  | "linkedin"
  | "imessage";

/** How much of a platform we can actually see. */
export type Reach =
  /** Channels, groups and DMs the connected account is a member of. */
  | "workspace"
  /** Only messages sent TO a business account you own. Not your own chats. */
  | "inbound"
  /** No live API — the user exports a file from the app and uploads it. */
  | "import"
  /** No lawful read path exists. Listed to explain, not to offer. */
  | "none";

export interface Connector {
  id: ConnectorId;
  label: string;
  icon: string; // lucide icon name
  reach: Reach;
  /** Can it read multi-party group threads (not just 1:1)? */
  groups: boolean;
  /** Implemented and shippable today. */
  live: boolean;
  /** The documented API this connector is built on, if any. */
  api: string | null;
  /** OAuth scopes / tokens the user must grant. */
  scopes: string[];
  /** Plain-language description of what you actually get. */
  note: string;
  /** Why it cannot be done. Set iff reach === "none". */
  blocked?: string;
  /** A real limitation the user should know before connecting. */
  caveat?: string;
}

export const CONNECTORS: Connector[] = [
  // ── Live today ──
  {
    id: "google-chat",
    label: "Google Chat",
    icon: "MessageSquare",
    reach: "workspace",
    groups: true,
    live: true,
    api: "Google Chat API — spaces.messages.list",
    scopes: ["chat.messages.readonly"],
    note: "Every space you're a member of, polled incrementally per space.",
  },

  // ── Sanctioned, buildable on the same contract ──
  {
    id: "slack",
    label: "Slack",
    icon: "Hash",
    reach: "workspace",
    groups: true,
    live: false,
    api: "Slack Web API — conversations.list / .history / .replies",
    scopes: [
      "channels:read", "channels:history",
      "groups:read", "groups:history",
      "im:history", "mpim:history",
      "users:read",
    ],
    note: "Public and private channels, DMs and group DMs the connected account can see. Thread replies included.",
    caveat: "A user token sees what that user sees; a bot token only sees channels the bot is invited to.",
  },
  {
    id: "teams",
    label: "Microsoft Teams",
    icon: "Users",
    reach: "workspace",
    groups: true,
    live: false,
    api: "Microsoft Graph — /me/chats, /teams/{id}/channels/{id}/messages",
    scopes: ["Chat.Read", "ChannelMessage.Read.All"],
    note: "Your 1:1 and group chats, plus channel messages in teams you belong to.",
    caveat: "ChannelMessage.Read.All requires tenant admin consent — an ordinary user cannot grant it alone.",
  },
  {
    id: "telegram",
    label: "Telegram",
    icon: "Send",
    reach: "workspace",
    groups: true,
    live: false,
    api: "Telegram Bot API — getUpdates / webhook",
    scopes: ["bot token"],
    note: "Groups you add the bot to, and DMs sent to the bot itself.",
    caveat:
      "Only messages sent AFTER the bot joins — Bot API cannot backfill history. Group privacy mode must be disabled in BotFather or the bot sees only commands.",
  },
  {
    id: "discord",
    label: "Discord",
    icon: "Gamepad2",
    reach: "workspace",
    groups: true,
    live: false,
    api: "Discord API — GET /channels/{id}/messages",
    scopes: ["bot token", "MESSAGE_CONTENT intent"],
    note: "Channels in servers the bot has been added to, with full history.",
    caveat: "Reading message text requires the privileged MESSAGE_CONTENT intent, which Discord reviews for larger apps.",
  },

  // ── Sanctioned but a narrower reach than users expect ──
  {
    id: "whatsapp-business",
    label: "WhatsApp Business",
    icon: "MessageCircle",
    reach: "inbound",
    groups: false,
    live: false,
    api: "WhatsApp Business Cloud API — messages webhook",
    scopes: ["whatsapp_business_messaging"],
    note: "Messages customers send to a business number your org owns.",
    caveat:
      "This is NOT your personal WhatsApp. The Cloud API has no group messaging at all — for group chats use the WhatsApp export importer instead.",
  },
  {
    id: "instagram",
    label: "Instagram DMs",
    icon: "Camera",
    reach: "inbound",
    groups: false,
    live: false,
    api: "Instagram Graph API — messages webhook",
    scopes: ["instagram_manage_messages", "pages_manage_metadata"],
    note: "The DM inbox of a Business or Creator account you own.",
    caveat: "Personal Instagram accounts have no messaging API — the account must be converted to Business/Creator.",
  },

  // ── User-initiated import: no API, but fully legitimate ──
  {
    id: "whatsapp-export",
    label: "WhatsApp chat export",
    icon: "Upload",
    reach: "import",
    groups: true,
    live: false,
    api: null,
    scopes: [],
    note:
      "You export a chat from WhatsApp (⋮ → More → Export chat) and upload the file. Works for group chats, which no WhatsApp API exposes.",
    caveat: "A point-in-time snapshot, not a live sync — re-export to pick up newer messages. Re-uploads dedupe, so nothing doubles.",
  },

  // ── No lawful read path ──
  {
    id: "snapchat",
    label: "Snapchat",
    icon: "Ghost",
    reach: "none",
    groups: false,
    live: false,
    api: null,
    scopes: [],
    note: "Not available.",
    blocked:
      "Snapchat publishes no conversation API — Snap Kit covers login, creative tools and Bitmoji only. Messages are also ephemeral by design, so there is nothing durable to read even in principle.",
  },
  {
    id: "linkedin",
    label: "LinkedIn",
    icon: "Briefcase",
    reach: "none",
    groups: false,
    live: false,
    api: null,
    scopes: [],
    note: "Not available.",
    blocked:
      "LinkedIn's messaging API is gated behind partner programs that are not open to general applicants. No self-serve OAuth scope grants message read access.",
  },
  {
    id: "imessage",
    label: "iMessage / SMS",
    icon: "Smartphone",
    reach: "none",
    groups: false,
    live: false,
    api: null,
    scopes: [],
    note: "Not available.",
    blocked:
      "Apple exposes no server-side API for Messages. The data lives only on-device, so a web app cannot reach it.",
  },
];

export const byId = (id: ConnectorId): Connector | undefined =>
  CONNECTORS.find((c) => c.id === id);

/** Sources a user can actually connect or import from. */
export const availableConnectors = (): Connector[] =>
  CONNECTORS.filter((c) => c.reach !== "none");

/** Listed only to explain why they're absent. Never offer these as connectable. */
export const unavailableConnectors = (): Connector[] =>
  CONNECTORS.filter((c) => c.reach === "none");

/** Connectors that can read multi-party group threads — the common ask. */
export const groupCapableConnectors = (): Connector[] =>
  CONNECTORS.filter((c) => c.groups);
