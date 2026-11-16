import { describe, expect, it } from "vitest";
import { INTERPRETATION_PROTOCOL, interpretInput } from "@/lib/inputInterpretation";

describe("interpretInput", () => {
  it("treats draft as draft force, not execute", () => {
    const i = interpretInput("draft an email to Ada explaining the API");
    expect(i.force).toBe("draft");
    expect(i.act).toBe("command");
    expect(i.obligations.some((o) => /Prepare content only/i.test(o))).toBe(true);
  });

  it("splits compound reminders and weather", () => {
    const i = interpretInput("remind me tomorrow at 7 to call the vendor and what's the weather");
    expect(i.act).toBe("compound");
    expect(i.obligations.some((o) => /every clause/i.test(o))).toBe(true);
  });

  it("classifies cancel and clarify", () => {
    expect(interpretInput("never mind").act).toBe("cancel");
    expect(interpretInput("where is the link?").act).toBe("clarify");
    expect(interpretInput("keep going").act).toBe("continue");
  });

  it("marks long paste as paste", () => {
    const i = interpretInput("summarise this:\n" + "x".repeat(1500));
    expect(i.act).toBe("paste");
  });

  it("read-only force for show/list questions", () => {
    const i = interpretInput("show my open tasks");
    expect(i.force).toBe("show");
    expect(i.obligations.some((o) => /Read-only/i.test(o))).toBe(true);
  });

  it("exposes a protocol string the system prompt can embed", () => {
    expect(INTERPRETATION_PROTOCOL).toMatch(/speech act/i);
    expect(INTERPRETATION_PROTOCOL).toMatch(/verb force/i);
  });

  it("builds a brief with act and force", () => {
    const i = interpretInput("send whatsapp to Mom saying I'll be late");
    expect(i.brief).toMatch(/Speech act: command/);
    expect(i.brief).toMatch(/Verb force: execute/);
    expect(i.obligations.some((o) => /recipient/i.test(o))).toBe(true);
  });
});
