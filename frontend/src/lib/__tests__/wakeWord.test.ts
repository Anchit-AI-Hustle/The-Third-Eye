import { describe, expect, it } from "vitest";

import { stripWakeTrigger, isNameTrigger } from "@/hooks/useWakeWord";

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

  it("drops everything the user said before the name", () => {
    expect(stripWakeTrigger("um so hey jarvis call my mother", "jarvis")).toBe("call my mother");
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
