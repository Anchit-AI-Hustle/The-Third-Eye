import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { isSensitive, summarizeAction } from "@/lib/actions";
import { mcpToolRisk } from "@/lib/mcp/permissions";
import { configuredServers, resetMcpCache } from "@/lib/mcp/client";
import { gmailSend, gmailSearch, calendarListEvents } from "@/lib/google/api";

const OLD_ENV = process.env;

beforeEach(() => {
  process.env = { ...OLD_ENV };
  resetMcpCache();
  vi.restoreAllMocks();
});
afterEach(() => {
  process.env = OLD_ENV;
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("google MCP tool names classify correctly", () => {
  // The server's tools go through the same gate as any third-party connector,
  // so their names have to land on the right side of it.
  it("treats the reads as reads", () => {
    expect(mcpToolRisk("mcp__google__gmail_search")).toBe("read");
    expect(mcpToolRisk("mcp__google__gmail_read_message")).toBe("read");
    expect(mcpToolRisk("mcp__google__calendar_list_events")).toBe("read");
  });

  it("treats sending as a write needing confirmation", () => {
    expect(mcpToolRisk("mcp__google__gmail_send")).toBe("write");
    expect(isSensitive("mcp__google__gmail_send")).toBe(true);
  });

  it("does not make reads ask for confirmation", () => {
    expect(isSensitive("mcp__google__gmail_search")).toBe(false);
    expect(isSensitive("mcp__google__calendar_list_events")).toBe(false);
  });
});

describe("communicate(email) is confirmed", () => {
  // Regression: SENSITIVE_ACTIONS lists `send_email`, but no tool by that name
  // is declared — the model calls `communicate`, which meant real Gmail sends
  // were skipping the confirmation gate entirely.
  it("gates a real email send", () => {
    expect(isSensitive("communicate", { action: "email", to: "a@b.com" })).toBe(true);
  });

  it("defaults to email when no action is given, matching the tool's own default", () => {
    expect(isSensitive("communicate", {})).toBe(true);
    expect(isSensitive("communicate", undefined)).toBe(true);
  });

  it("leaves deep-link modes alone — those already need a tap", () => {
    expect(isSensitive("communicate", { action: "whatsapp" })).toBe(false);
    expect(isSensitive("communicate", { action: "sms" })).toBe(false);
    expect(isSensitive("communicate", { action: "call" })).toBe(false);
    expect(isSensitive("communicate", { action: "read_emails" })).toBe(false);
  });

  it("summarizes what is being approved", () => {
    expect(summarizeAction("communicate", { to: "v@x.com", subject: "Q3" })).toContain("v@x.com");
    expect(summarizeAction("communicate", { to: "v@x.com", subject: "Q3" })).toContain("Q3");
  });
});

describe("MCP client identity handling", () => {
  it("marks only servers explicitly flagged internal", () => {
    process.env.MCP_SERVERS = JSON.stringify([
      { name: "google", url: "https://app.test/api/mcp/google", internal: true },
      { name: "weather", url: "https://third.party/mcp" },
    ]);
    const servers = configuredServers();
    expect(servers.find((s) => s.name === "google")?.internal).toBe(true);
    // Absent means false, never undefined — the header check must not be leaky.
    expect(servers.find((s) => s.name === "weather")?.internal).toBe(false);
  });

  it("ignores a non-boolean internal value rather than trusting it", () => {
    process.env.MCP_SERVERS = JSON.stringify([
      { name: "sneaky", url: "https://third.party/mcp", internal: "true" },
    ]);
    expect(configuredServers()[0].internal).toBe(false);
  });
});

describe("gmail send", () => {
  it("builds an RFC 2822 message and posts it", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({ id: "m1" }));
    const res = await gmailSend("tok", "v@x.com", "Hello", "Body text");
    expect(res.ok).toBe(true);

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/messages/send");
    const raw = JSON.parse(String((init as RequestInit).body)).raw;
    const decoded = Buffer.from(raw, "base64url").toString("utf-8");
    expect(decoded).toContain("To: v@x.com");
    expect(decoded).toContain("Subject: Hello");
    expect(decoded).toContain("Body text");
  });

  it("strips newlines so a subject cannot inject extra headers", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({ id: "m1" }));
    await gmailSend("tok", "v@x.com", "Hi\r\nBcc: attacker@evil.com", "Body");
    const raw = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body)).raw;
    const decoded = Buffer.from(raw, "base64url").toString("utf-8");
    // The injected header must be folded into the subject, not stand on its own.
    expect(decoded).not.toMatch(/^Bcc:/m);
    expect(decoded).toContain("Subject: Hi Bcc: attacker@evil.com");
  });

  it("refuses an empty recipient before calling Google", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const res = await gmailSend("tok", "   ", "s", "b");
    expect(res.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports a revoked grant as needing reconnection, not as a generic failure", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({}, 403));
    const res = await gmailSend("tok", "v@x.com", "s", "b");
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reauth).toBe(true);
      expect(res.error).toMatch(/Reconnect/i);
    }
  });
});

describe("gmail search", () => {
  it("returns an empty list rather than an error for no matches", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({}));
    const res = await gmailSearch("tok", "is:unread", 5);
    expect(res).toEqual({ ok: true, data: [] });
  });

  it("caps max_results so the model cannot request the whole mailbox", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({}));
    await gmailSearch("tok", "is:unread", 5000);
    expect(String(fetchMock.mock.calls[0][0])).toContain("maxResults=25");
  });

  it("surfaces a rate limit as retryable rather than as no mail", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({}, 429));
    const res = await gmailSearch("tok", "is:unread", 5);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/rate-limited/i);
  });
});

describe("calendar list", () => {
  it("requests an ordered, expanded window", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({ items: [] }));
    await calendarListEvents("tok", 7, 10, new Date("2026-08-25T00:00:00Z"));
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain("singleEvents=true");
    expect(url).toContain("orderBy=startTime");
    expect(url).toContain("timeMin=2026-08-25T00%3A00%3A00.000Z");
    expect(url).toContain("timeMax=2026-09-01T00%3A00%3A00.000Z");
  });

  it("normalizes all-day and timed events the same way", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({
        items: [
          { id: "1", summary: "Standup", start: { dateTime: "2026-08-26T09:00:00Z" }, end: { dateTime: "2026-08-26T09:15:00Z" }, attendees: [{}, {}] },
          { id: "2", start: { date: "2026-08-27" }, end: { date: "2026-08-28" } },
        ],
      }),
    );
    const res = await calendarListEvents("tok", 7, 10, new Date("2026-08-25T00:00:00Z"));
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data[0]).toMatchObject({ summary: "Standup", attendees: 2 });
      expect(res.data[1]).toMatchObject({ summary: "(no title)", start: "2026-08-27", attendees: 0 });
    }
  });
});
