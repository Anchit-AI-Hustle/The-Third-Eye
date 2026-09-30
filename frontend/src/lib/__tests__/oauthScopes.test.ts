import { describe, expect, it } from "vitest";
import { INGESTION_SCOPE_LIST } from "@/lib/googleToken";
import {
  CHAT_MESSAGES_JUSTIFICATION,
  GMAIL_READONLY_JUSTIFICATION,
  RESTRICTED_CHAT_SCOPE_LIST,
  RESTRICTED_GMAIL_SCOPE_LIST,
  SENSITIVE_SCOPE_LIST,
  SENSITIVE_SCOPES_JUSTIFICATION,
} from "@/lib/oauthJustifications";

const MAX = 1000;

describe("OAuth scopes requested of Google", () => {
  it("asks for exactly the five feature scopes, nothing extra", () => {
    expect([...INGESTION_SCOPE_LIST]).toEqual([
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/gmail.send",
      "https://www.googleapis.com/auth/calendar.readonly",
      "https://www.googleapis.com/auth/chat.spaces.readonly",
      "https://www.googleapis.com/auth/chat.messages.readonly",
    ]);
  });

  it("does not request write/calendar.events or Chat-app bot scopes", () => {
    const set = new Set(INGESTION_SCOPE_LIST);
    expect(set.has("https://www.googleapis.com/auth/calendar.events")).toBe(false);
    expect(set.has("https://www.googleapis.com/auth/gmail.modify")).toBe(false);
    expect(set.has("https://www.googleapis.com/auth/chat.messages")).toBe(false);
    expect(set.has("https://www.googleapis.com/auth/chat.bot")).toBe(false);
  });

  it("groups those five the way Data Access boxes them", () => {
    expect([...SENSITIVE_SCOPE_LIST, ...RESTRICTED_GMAIL_SCOPE_LIST, ...RESTRICTED_CHAT_SCOPE_LIST].sort()).toEqual(
      [...INGESTION_SCOPE_LIST].sort(),
    );
  });
});

describe("Data Access justifications (paste into the Console)", () => {
  it("fits Google's 1000-character boxes", () => {
    expect(SENSITIVE_SCOPES_JUSTIFICATION.length).toBeLessThanOrEqual(MAX);
    expect(GMAIL_READONLY_JUSTIFICATION.length).toBeLessThanOrEqual(MAX);
    expect(CHAT_MESSAGES_JUSTIFICATION.length).toBeLessThanOrEqual(MAX);
  });

  it("names every scope in its box and why a narrower one fails", () => {
    for (const s of ["gmail.send", "calendar.readonly", "chat.spaces.readonly"]) {
      expect(SENSITIVE_SCOPES_JUSTIFICATION).toContain(s);
    }
    expect(SENSITIVE_SCOPES_JUSTIFICATION.toLowerCase()).toContain("insufficient");
    expect(GMAIL_READONLY_JUSTIFICATION).toContain("gmail.readonly");
    expect(GMAIL_READONLY_JUSTIFICATION).toContain("gmail.metadata");
    expect(CHAT_MESSAGES_JUSTIFICATION).toContain("chat.messages.readonly");
    expect(CHAT_MESSAGES_JUSTIFICATION.toLowerCase()).toContain("insufficient");
    expect(CHAT_MESSAGES_JUSTIFICATION.toLowerCase()).toContain("not a google chat bot");
  });
});
