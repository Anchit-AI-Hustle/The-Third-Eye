import { describe, expect, it } from "vitest";
import { explicitlyRequested } from "@/lib/explicitRequest";

describe("explicitlyRequested: the user's own words ask for this action now", () => {
  it("an email the user told JARVIS to send", () => {
    expect(explicitlyRequested("send a mail to ravi@x.com saying hi", "communicate", { action: "email", to: "ravi@x.com" })).toBe(true);
    expect(explicitlyRequested("email priya@x.com that the meeting moved to 4", "communicate", { action: "email", to: "Priya@x.com" })).toBe(true);
  });

  it("not when the user only asked to read, draft or summarise", () => {
    expect(explicitlyRequested("summarise my inbox", "communicate", { action: "email", to: "a@x.com" })).toBe(false);
    expect(explicitlyRequested("draft an email to Priya, don't send it", "communicate", { action: "email", to: "priya@x.com" })).toBe(false);
    expect(explicitlyRequested("what did Ravi email me?", "communicate", { action: "email", to: "ravi@x.com" })).toBe(false);
  });

  it("not to a recipient the user never named, even when they asked to send", () => {
    expect(explicitlyRequested("send the summary of my last 5 emails to Bob", "communicate", { action: "email", to: "exfil@evil.com" })).toBe(false);
    expect(explicitlyRequested("email Priya the notes", "communicate", { action: "email", to: "priya@x.com, spy@evil.com" })).toBe(false);
    expect(explicitlyRequested("email Priya the notes", "communicate", { action: "email" })).toBe(false);
    // A name the user said, paired with an address they didn't, still asks first.
    expect(explicitlyRequested("email Bob the notes", "communicate", { action: "email", to: "bob@evil.com" })).toBe(false);
  });

  it("an app the user asked to build, and ANCHOR actions they named", () => {
    expect(explicitlyRequested("build me a habit tracker app", "build_app", { name: "habits" })).toBe(true);
    expect(explicitlyRequested("what apps could you build?", "build_app", { name: "x" })).toBe(false);
    expect(explicitlyRequested("run today's anchor drop now", "anchor", { action: "run" })).toBe(true);
    expect(explicitlyRequested("how is anchor doing", "anchor", { action: "run" })).toBe(false);
  });

  it("a connector write the user asked for", () => {
    expect(explicitlyRequested("post this in #general on Slack", "mcp__slack__send_message", {})).toBe(true);
    expect(explicitlyRequested("what's new on Slack?", "mcp__slack__send_message", {})).toBe(false);
  });

  it("never for a request that came from somewhere other than the user's message", () => {
    expect(explicitlyRequested("", "communicate", { action: "email", to: "a@x.com" })).toBe(false);
  });
});
