import { describe, expect, it } from "vitest";

import { stripWakeTrigger } from "@/hooks/useWakeWord";

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

describe("triggers that are not the agent's name", () => {
  it("carries the command through a bare 'hey'", () => {
    expect(stripWakeTrigger("hey what time is it", "hey")).toBe("what time is it");
  });

  it("still returns nothing for a bare greeting", () => {
    expect(stripWakeTrigger("hey", "hey")).toBe("");
  });
});
