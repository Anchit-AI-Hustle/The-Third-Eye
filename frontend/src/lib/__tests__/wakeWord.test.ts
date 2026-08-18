import { describe, expect, it } from "vitest";

import { stripWakeTrigger, isNameTrigger, matchTrigger, buildTriggerSet } from "@/hooks/useWakeWord";

// Waking on "hey JARVIS, what's the weather" used to open a mic and throw the
// question away, so the user had to say it twice. The command has to survive
// the wake.

describe("keeping the command that came with the name", () => {
  it.each([
    ["hey jarvis what's the weather", "jarvis", "what s the weather"],
    ["JARVIS, add milk to my list", "jarvis", "add milk to my list"],
    ["ok jarvis please open my tasks", "jarvis", "open my tasks"],
    ["hello friday how many tasks are open", "friday", "how many tasks are open"],
  ])("%s → %s", (said, trigger, expected) => {
    expect(stripWakeTrigger(said, trigger)).toBe(expected);
  });

  it("keeps a command that follows a multi-word agent name", () => {
    expect(stripWakeTrigger("hey e d i t h summarise my inbox", "e d i t h")).toBe("summarise my inbox");
  });

  it("tolerates the noise people start a sentence with", () => {
    expect(stripWakeTrigger("um so hey jarvis call my mother", "jarvis")).toBe("call my mother");
  });
});

// Some agent names are ordinary words — FRIDAY is a shipped persona and a
// weekday. Someone addressing the agent leads with its name; a name buried in a
// sentence about something else is not an instruction, and acting on the rest
// of that sentence would post overheard speech to chat.

describe("the name has to be what the sentence opens with", () => {
  it.each([
    ["next friday can you send the invoice", "friday"],
    ["let's do it on friday and tell the team", "friday"],
    ["I told jarvis to book the table", "jarvis"],
  ])("refuses to take a command out of %s", (said, trigger) => {
    expect(stripWakeTrigger(said, trigger)).toBe("");
  });

  it("still takes one when the agent is addressed directly", () => {
    expect(stripWakeTrigger("friday send the invoice", "friday")).toBe("send the invoice");
  });

  it("still takes one after a greeting", () => {
    expect(stripWakeTrigger("hey friday send the invoice", "friday")).toBe("send the invoice");
  });
});

describe("hearing only the name", () => {
  it.each([
    ["jarvis", "jarvis"],
    ["hey jarvis", "jarvis"],
    ["JARVIS!", "jarvis"],
    ["ok jarvis please", "jarvis"],
  ])("treats %s as an introduction, not a command", (said, trigger) => {
    // Empty is the signal to open up and listen rather than answer something.
    expect(stripWakeTrigger(said, trigger)).toBe("");
  });

  it("ignores a single stray word, which is usually a misheard name", () => {
    expect(stripWakeTrigger("hey jarvis jarvis", "jarvis")).toBe("");
  });
});

// Greetings wake the agent, but they are also words people say to each other.
// Acting on what follows one would post overheard conversation as an
// authenticated chat turn, so only the agent's own name qualifies a sentence as
// a command. A greeting still wakes it — it opens the panel and listens, where
// the user can see it happen.

// Matching the name inside a longer word is not a near-miss: the name is what
// licenses treating the rest of the sentence as a command, so "Meredith can you
// send the files" would have been posted as a chat turn.

describe("matching the name on word boundaries", () => {
  const edith = buildTriggerSet("E.D.I.T.H.");
  const jarvis = buildTriggerSet("JARVIS");

  it.each([
    "meredith can you send the files",
    "we should credit her for it",
  ])("does not wake on %s", (heard) => {
    expect(matchTrigger(heard, edith)).toBeNull();
  });

  it("still wakes on the name spoken as one word", () => {
    expect(matchTrigger("edith what's on today", edith)).toBe("edith");
  });

  it("still wakes on the name spelled out", () => {
    expect(matchTrigger("e d i t h what's on today", edith)).toBe("e d i t h");
  });

  it("wakes on the name at the end of a sentence", () => {
    expect(matchTrigger("what time is it jarvis", jarvis)).toBe("jarvis");
  });

  it("wakes on the name mid-sentence", () => {
    expect(matchTrigger("so jarvis what now", jarvis)).toBe("jarvis");
  });
});

describe("telling the name from a greeting", () => {
  it.each([
    ["jarvis", "JARVIS"],
    ["friday", "FRIDAY"],
    ["edith", "E.D.I.T.H."],
  ])("recognises %s as the agent's own name", (trigger, agentName) => {
    expect(isNameTrigger(trigger, agentName)).toBe(true);
  });

  it.each(["hey", "hi", "ok", "hello"])("does not treat %s as the name", (trigger) => {
    expect(isNameTrigger(trigger, "JARVIS")).toBe(false);
  });

  it("matches one word of a multi-word name", () => {
    expect(isNameTrigger("edith", "EDITH Prime")).toBe(true);
  });

  it("is false when there is no agent name to compare against", () => {
    expect(isNameTrigger("jarvis", "")).toBe(false);
  });
});
