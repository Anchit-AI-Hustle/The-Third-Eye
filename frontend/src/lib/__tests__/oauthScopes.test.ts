import { describe, expect, it } from "vitest";
import { GOOGLE_SIGNIN_PARAMS, INGESTION_SCOPE_LIST, SIGNIN_SCOPES } from "@/lib/googleToken";
import {
  GMAIL_READONLY_JUSTIFICATION,
  RESTRICTED_GMAIL_SCOPE_LIST,
  SENSITIVE_SCOPE_LIST,
  SENSITIVE_SCOPES_JUSTIFICATION,
} from "@/lib/oauthJustifications";

const MAX = 1000;

describe("OAuth scopes requested of Google", () => {
  it("asks for exactly the three feature scopes, nothing extra", () => {
    expect([...INGESTION_SCOPE_LIST]).toEqual([
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/gmail.send",
      "https://www.googleapis.com/auth/calendar.events.owned.readonly",
    ]);
  });

  it("signs in with name and email only, never a Gmail or Calendar scope", () => {
    expect(SIGNIN_SCOPES).toBe("openid email profile");
    expect(GOOGLE_SIGNIN_PARAMS.prompt).toBe("select_account");
    expect(GOOGLE_SIGNIN_PARAMS.access_type).toBe("online");
    for (const scope of INGESTION_SCOPE_LIST) {
      expect(SIGNIN_SCOPES.split(" ")).not.toContain(scope);
    }
  });

  it("does not request broader Calendar, write Gmail or any Chat scope", () => {
    const scopes = [...INGESTION_SCOPE_LIST] as string[];
    expect(scopes).not.toContain("https://www.googleapis.com/auth/calendar.readonly");
    expect(scopes).not.toContain("https://www.googleapis.com/auth/calendar.events.readonly");
    expect(scopes).not.toContain("https://www.googleapis.com/auth/calendar.events");
    expect(scopes).not.toContain("https://www.googleapis.com/auth/gmail.modify");
    expect(scopes.some((s) => s.includes("/auth/chat."))).toBe(false);
  });

  it("groups those three the way Data Access boxes them", () => {
    expect([...SENSITIVE_SCOPE_LIST, ...RESTRICTED_GMAIL_SCOPE_LIST].sort()).toEqual([...INGESTION_SCOPE_LIST].sort());
  });
});

describe("Data Access justifications (paste into the Console)", () => {
  it("fits Google's 1000-character boxes", () => {
    expect(SENSITIVE_SCOPES_JUSTIFICATION.length).toBeLessThanOrEqual(MAX);
    expect(GMAIL_READONLY_JUSTIFICATION.length).toBeLessThanOrEqual(MAX);
  });

  it("names every scope in its box and why a narrower one fails", () => {
    for (const s of ["gmail.send", "calendar.events.owned.readonly"]) {
      expect(SENSITIVE_SCOPES_JUSTIFICATION).toContain(s);
    }
    expect(SENSITIVE_SCOPES_JUSTIFICATION.toLowerCase()).toContain("insufficient");
    expect(GMAIL_READONLY_JUSTIFICATION).toContain("gmail.readonly");
    expect(GMAIL_READONLY_JUSTIFICATION).toContain("gmail.metadata");
    expect(`${SENSITIVE_SCOPES_JUSTIFICATION}${GMAIL_READONLY_JUSTIFICATION}`.toLowerCase()).not.toContain("chat.");
  });
});
