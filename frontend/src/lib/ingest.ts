import { getGoogleAccessToken } from "@/lib/googleToken";
import { extractEmailTasks } from "@/lib/extract";
import { saveExtractedTasks } from "@/lib/tasks";
import { logActivity } from "@/lib/activity";
import { alreadyProcessed, markProcessed, type Sb } from "@/lib/cron";

const GMAIL_MAX_PER_USER = 25;
const GMAIL_QUERY = "is:unread newer_than:2d";

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
