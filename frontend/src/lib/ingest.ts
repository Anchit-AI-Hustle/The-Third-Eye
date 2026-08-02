import { getGoogleAccessToken } from "@/lib/googleToken";
import { extractEmailTasks, extractMeetingTasks } from "@/lib/extract";
import { saveExtractedTasks } from "@/lib/tasks";
import { logActivity } from "@/lib/activity";
import { alreadyProcessed, markProcessed, type Sb } from "@/lib/cron";
import { discoverConversations, includedConversations } from "@/lib/conversationSources";

const GMAIL_MAX_PER_USER = 25;
const GMAIL_QUERY = "is:unread newer_than:2d";
const CHAT_MAX_SPACES = 15;
const CHAT_MAX_MSGS_PER_SPACE = 25;

// ─── Gmail ───────────────────────────────────────────────────────────────────

interface GPart { mimeType?: string; body?: { data?: string }; parts?: GPart[] }
interface GMsg {
  payload?: GPart & { headers?: { name?: string; value?: string }[] };
  internalDate?: string;
  snippet?: string;
  threadId?: string;
}

function decodeB64Url(data?: string): string {
  if (!data) return "";
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8");
}

function extractBody(payload?: GPart): string {
  if (!payload) return "";
  const stack: GPart[] = [payload];
  let html = "";
  while (stack.length) {
    const p = stack.shift()!;
    if (p.mimeType === "text/plain" && p.body?.data) return decodeB64Url(p.body.data);
    if (p.mimeType === "text/html" && p.body?.data && !html) html = decodeB64Url(p.body.data);
    if (p.parts) stack.push(...p.parts);
  }
  return html ? html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() : "";
}

async function fetchMessage(access: string, id: string) {
  const r = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`, {
    headers: { Authorization: `Bearer ${access}` },
  });
  if (!r.ok) return null;
  const m = (await r.json()) as GMsg;
  const headers = m.payload?.headers ?? [];
  const h = (name: string) =>
    headers.find((x) => (x.name ?? "").toLowerCase() === name.toLowerCase())?.value ?? "";
  const receivedAt = m.internalDate
    ? new Date(Number(m.internalDate)).toISOString()
    : new Date().toISOString();
  const body = extractBody(m.payload) || m.snippet || "";
  return { from: h("From"), subject: h("Subject"), receivedAt, body, threadId: m.threadId };
}

export async function scrapeGmailForUser(sb: Sb, email: string) {
  const tok = await getGoogleAccessToken(email);
  if (!tok || !(tok.scope ?? "").includes("gmail.readonly")) return { skipped: "gmail not connected" };

  const listRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${GMAIL_MAX_PER_USER}&q=${encodeURIComponent(GMAIL_QUERY)}`,
    { headers: { Authorization: `Bearer ${tok.accessToken}` } },
  );
  if (!listRes.ok) return { error: `list ${listRes.status}` };
  const list = (await listRes.json()) as { messages?: { id: string }[] };
  const ids = (list.messages ?? []).map((m) => m.id);

  let processed = 0, inserted = 0, merged = 0;
  for (const id of ids) {
    if (await alreadyProcessed(sb, email, "gmail", id)) continue;
    const msg = await fetchMessage(tok.accessToken, id);
    if (msg) {
      const ex = await extractEmailTasks({
        sender: msg.from,
        subject: msg.subject,
        receivedAt: msg.receivedAt,
        body: msg.body,
      });
      if (ex.isActionable && ex.tasks.length) {
        const r = await saveExtractedTasks(
          {
            userId: email,
            sourceType: "Email",
            sourceRefId: id,
            sourceDetail: `Email from ${msg.from}`,
            sourceLink: `https://mail.google.com/mail/u/0/#inbox/${msg.threadId || id}`,
            dateGiven: msg.receivedAt,
          },
          ex.tasks,
        );
        inserted += r.inserted;
        merged += r.merged;
      }
    }
    await markProcessed(sb, email, "gmail", id);
    processed++;
  }

  if (processed) {
    await logActivity(email, "ingestion", `Gmail scan: ${processed} new email(s)`, {
      detail: `${inserted} task(s) created, ${merged} merged`,
      context: { processed, inserted, merged },
    });
  }
  return { processed, inserted, merged, capped: ids.length >= GMAIL_MAX_PER_USER };
}

// ─── Google Chat ───────────────────────────────────────────────────────────────

interface ChatMsg {
  name?: string;
  text?: string;
  createTime?: string;
  sender?: { displayName?: string };
}

async function gget(access: string, url: string) {
  const r = await fetch(url, { headers: { Authorization: `Bearer ${access}` } });
  if (!r.ok) throw new Error(`chat ${r.status}`);
  return r.json();
}

async function watermark(sb: Sb, email: string, space: string): Promise<string | null> {
  const { data } = await sb
    .from("chat_watermarks").select("last_create_time")
    .eq("user_id", email).eq("space_name", space).maybeSingle();
  return (data as { last_create_time?: string } | null)?.last_create_time ?? null;
}

async function setWatermark(sb: Sb, email: string, space: string, ts: string): Promise<void> {
  await sb.from("chat_watermarks").upsert(
    { user_id: email, space_name: space, last_create_time: ts, updated_at: new Date().toISOString() },
    { onConflict: "user_id,space_name" },
  );
}

/**
 * List the Chat spaces this account can see and record them as discovered.
 *
 * Split out of scrapeChatForUser so the settings picker can populate itself on
 * demand — otherwise a freshly-connected user stares at an empty list until the
 * next cron poll. Never flips `included`, so calling it repeatedly is safe.
 */
export async function discoverChatSpaces(sb: Sb, email: string) {
  const tok = await getGoogleAccessToken(email);
  if (!tok || !(tok.scope ?? "").includes("chat.messages.readonly")) return { skipped: "chat not connected" as const };

  const spacesRes = (await gget(tok.accessToken, "https://chat.googleapis.com/v1/spaces?pageSize=100")) as {
    spaces?: { name?: string; displayName?: string; spaceType?: string }[];
  };
  const visible = (spacesRes.spaces ?? []).filter(
    (s): s is { name: string; displayName?: string; spaceType?: string } => !!s.name,
  );

  const { discovered } = await discoverConversations(
    sb,
    email,
    "google-chat",
    visible.map((s) => ({
      conversationId: s.name,
      label: s.displayName ?? s.name.replace(/^spaces\//, ""),
      link: `https://mail.google.com/chat/u/0/#chat/space/${s.name.replace(/^spaces\//, "")}`,
      isGroup: s.spaceType === "SPACE",
    })),
  );
  return { visible: visible.length, discovered };
}

export async function scrapeChatForUser(sb: Sb, email: string) {
  const tok = await getGoogleAccessToken(email);
  if (!tok || !(tok.scope ?? "").includes("chat.messages.readonly")) return { skipped: "chat not connected" };
  const access = tok.accessToken;

  // Record what this account can see so the picker has something to list. This
  // never flips `included`, so re-polling can't change the user's selection.
  const seen = await discoverChatSpaces(sb, email);
  const visibleCount = "visible" in seen ? seen.visible : 0;

  // Ingest ONLY opted-in spaces. Previously this took whichever spaces the API
  // returned first, so every conversation the user belonged to fed the tracker.
  // A freshly-connected account now discovers chats and ingests none until the
  // user picks which ones to watch.
  const watched = await includedConversations(sb, email, "google-chat");
  const meta = new Map(watched.map((w) => [w.conversationId, w]));
  const spaces = watched.map((w) => w.conversationId).slice(0, CHAT_MAX_SPACES);
  if (!spaces.length) {
    return { processed: 0, inserted: 0, merged: 0, spaces: 0, visible: visibleCount };
  }

  let processed = 0, inserted = 0, merged = 0;
  for (const space of spaces) {
    const since = await watermark(sb, email, space);
    const filter = since ? `&filter=${encodeURIComponent(`createTime > "${since}"`)}` : "";
    let res: { messages?: ChatMsg[] };
    try {
      res = (await gget(
        access,
        `https://chat.googleapis.com/v1/${space}/messages?pageSize=${CHAT_MAX_MSGS_PER_SPACE}&orderBy=${encodeURIComponent("createTime desc")}${filter}`,
      )) as { messages?: ChatMsg[] };
    } catch {
      continue; // a single locked space shouldn't stop the rest
    }
    const msgs = (res.messages ?? []).slice().sort((a, b) => (a.createTime ?? "").localeCompare(b.createTime ?? ""));
    // Messages are ascending. Advance the watermark ONLY after a message is fully
    // processed — never before extraction — so a mid-space failure can't skip
    // unprocessed messages. On error we stop this space and retry it next run.
    for (const m of msgs) {
      const id = (m.name ?? "").split("/").pop() ?? "";
      const text = (m.text ?? "").trim();

      // Empty/non-actionable or already-seen messages are safe to skip past.
      if (!id || !text || (await alreadyProcessed(sb, email, "chat", id))) {
        if (m.createTime) await setWatermark(sb, email, space, m.createTime);
        continue;
      }

      try {
        const ex = await extractMeetingTasks({
          startedAt: m.createTime ?? new Date().toISOString(),
          transcript: text,
          defaultOwner: m.sender?.displayName ?? null,
        });
        if (ex.tasks.length) {
          const bare = space.replace(/^spaces\//, "");
          const chat = meta.get(space);
          const sender = m.sender?.displayName;
          const r = await saveExtractedTasks(
            {
              userId: email,
              sourceType: "Chat",
              sourceRefId: `chat:${id}`,
              // Name the CHAT first: a tracker row has to say which conversation it
              // came from, not just who happened to speak in it.
              sourceDetail: `Google Chat · ${chat?.label ?? bare}${sender ? ` · ${sender}` : ""}`,
              sourceLink: chat?.link ?? `https://mail.google.com/chat/u/0/#chat/space/${bare}`,
              dateGiven: m.createTime ?? null,
            },
            ex.tasks,
          );
          inserted += r.inserted;
          merged += r.merged;
        }
        await markProcessed(sb, email, "chat", id);
        processed++;
        if (m.createTime) await setWatermark(sb, email, space, m.createTime); // only after success
      } catch {
        break; // leave watermark at last success; this space resumes next run
      }
    }
  }

  if (processed) {
    await logActivity(email, "ingestion", `Chat scan: ${processed} new message(s)`, {
      detail: `${inserted} task(s) created, ${merged} merged`,
      context: { processed, inserted, merged, spaces: spaces.length },
    });
  }
  return { processed, inserted, merged, spaces: spaces.length };
}
