import { describe, expect, it } from "vitest";
import { isEchoOf } from "@/hooks/useVoice";

describe("assistant voice echo guard", () => {
  it("rejects a transcript that repeats the assistant's reply", () => {
    expect(isEchoOf("you have three open tasks and the q3 report is due friday", "You have three open tasks. The Q3 report is due Friday."))
      .toBe(true);
  });

  it("keeps a user response that adds their own words", () => {
    expect(isEchoOf("yes send the email to John", "Should I send the email to John Smith?"))
      .toBe(false);
  });
});
