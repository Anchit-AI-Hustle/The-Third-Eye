/**
 * Thin Gmail/Calendar REST helpers used by the in-repo MCP server.
 *
 * They return structured results rather than pre-formatted prose, because the
 * MCP layer serialises them and the model reads the JSON. Failures come back as
 * a typed error instead of a thrown exception, so a revoked grant reads as
 * "reconnect Google" rather than a stack trace — and so a caller can never
 * mistake a failure for an empty inbox.
 */

const GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me";
const CALENDAR = "https://www.googleapis.com/calendar/v3";

export type GoogleResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; reauth?: boolean };

function fail(status: number, what: string): GoogleResult<never> {
  if (status === 401 || status === 403) {
    return {
      ok: false,
      reauth: true,
      error:
        `Google rejected the request (HTTP ${status}) — the grant is missing this permission or was revoked. ` +
        `Reconnect from Settings → Connections → "Reconnect / update permissions".`,
    };
  }
  if (status === 429) return { ok: false, error: `Google rate-limited the ${what} request. Try again shortly.` };
  return { ok: false, error: `Google returned HTTP ${status} for the ${what} request.` };
}

async function authed(url: string, token: string, init?: RequestInit): Promise<Response> {
  return fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
}

export interface MailSummary {
  id: string;
  from: string;
  to: string;
  subject: string;
  date: string;
  snippet: string;
}

function header(msg: any, name: string): string {
  return (msg?.payload?.headers ?? []).find((h: any) => h?.name?.toLowerCase() === name.toLowerCase())?.value ?? "";
}

/** Search the mailbox with Gmail's own query syntax (`from:x is:unread` …). */
export async function gmailSearch(
  token: string,
  query: string,
  maxResults: number,
): Promise<GoogleResult<MailSummary[]>> {
  const capped = Math.max(1, Math.min(maxResults || 5, 25));
  const listRes = await authed(
    `${GMAIL}/messages?${new URLSearchParams({ q: query, maxResults: String(capped) })}`,
    token,
  );
  if (!listRes.ok) return fail(listRes.status, "mail search");

  const list = await listRes.json();
  const ids: Array<{ id: string }> = list.messages ?? [];
  if (!ids.length) return { ok: true, data: [] };

  const details = await Promise.all(
    ids.slice(0, capped).map(async (m) => {
      const res = await authed(
        `${GMAIL}/messages/${m.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Date`,
        token,
      );
      if (!res.ok) return null;
      const msg = await res.json();
      return {
        id: m.id,
        from: header(msg, "From"),
        to: header(msg, "To"),
        subject: header(msg, "Subject"),
        date: header(msg, "Date"),
        snippet: msg.snippet ?? "",
      } satisfies MailSummary;
    }),
  );
  return { ok: true, data: details.filter((d): d is MailSummary => d !== null) };
}

/** Decode the base64url body Gmail returns, preferring text/plain. */
function extractBody(payload: any): string {
  if (!payload) return "";
  const decode = (data?: string) => (data ? Buffer.from(data, "base64url").toString("utf-8") : "");
  if (payload.mimeType === "text/plain" && payload.body?.data) return decode(payload.body.data);
  for (const part of payload.parts ?? []) {
    const found = extractBody(part);
    if (found) return found;
  }
  // No plain-text part anywhere — fall back to whatever the top level carries.
  return decode(payload.body?.data);
}

export interface MailMessage extends MailSummary {
  body: string;
}

export async function gmailReadMessage(token: string, id: string): Promise<GoogleResult<MailMessage>> {
  const res = await authed(`${GMAIL}/messages/${encodeURIComponent(id)}?format=full`, token);
  if (!res.ok) return fail(res.status, "mail read");
  const msg = await res.json();
  const body = extractBody(msg.payload);
  return {
    ok: true,
    data: {
      id,
      from: header(msg, "From"),
      to: header(msg, "To"),
      subject: header(msg, "Subject"),
      date: header(msg, "Date"),
      snippet: msg.snippet ?? "",
      // Long threads would blow the model's context; the id is there to fetch more.
      body: body.length > 20_000 ? `${body.slice(0, 20_000)}\n\n[truncated]` : body,
    },
  };
}

/**
 * RFC 2822 headers must not contain bare newlines: a `\n` inside a subject or
 * recipient lets the caller inject extra headers (a Bcc, a different From).
 * Strip them rather than trusting the model's arguments.
 */
function headerSafe(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

export async function gmailSend(
  token: string,
  to: string,
  subject: string,
  body: string,
): Promise<GoogleResult<{ id: string }>> {
  if (!to.trim()) return { ok: false, error: "No recipient given." };
  const raw = [
    `To: ${headerSafe(to)}`,
    `Subject: ${headerSafe(subject)}`,
    "Content-Type: text/plain; charset=utf-8",
    "",
    body,
  ].join("\r\n");
  const res = await authed(`${GMAIL}/messages/send`, token, {
    method: "POST",
    body: JSON.stringify({ raw: Buffer.from(raw).toString("base64url") }),
  });
  if (!res.ok) return fail(res.status, "mail send");
  const sent = await res.json();
  return { ok: true, data: { id: sent.id ?? "" } };
}

export interface CalendarEvent {
  id: string;
  summary: string;
  start: string;
  end: string;
  location: string;
  attendees: number;
}

export async function calendarListEvents(
  token: string,
  daysAhead: number,
  maxResults: number,
  now = new Date(),
): Promise<GoogleResult<CalendarEvent[]>> {
  const capped = Math.max(1, Math.min(maxResults || 10, 50));
  const days = Math.max(1, Math.min(daysAhead || 7, 365));
  const timeMax = new Date(now.getTime() + days * 86_400_000);
  const res = await authed(
    `${CALENDAR}/calendars/primary/events?${new URLSearchParams({
      timeMin: now.toISOString(),
      timeMax: timeMax.toISOString(),
      maxResults: String(capped),
      singleEvents: "true",
      orderBy: "startTime",
    })}`,
    token,
  );
  if (!res.ok) return fail(res.status, "calendar list");
  const data = await res.json();
  const events: CalendarEvent[] = (data.items ?? []).map((e: any) => ({
    id: e.id ?? "",
    summary: e.summary ?? "(no title)",
    start: e.start?.dateTime ?? e.start?.date ?? "",
    end: e.end?.dateTime ?? e.end?.date ?? "",
    location: e.location ?? "",
    attendees: Array.isArray(e.attendees) ? e.attendees.length : 0,
  }));
  return { ok: true, data: events };
}
