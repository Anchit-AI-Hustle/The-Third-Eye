import { describe, expect, it } from "vitest";
import { compactPersona, compactSystem, selectTools, trimHistory } from "@/lib/compactChat";

const PERSONA = `You are JARVIS.\n\n## Character\n- direct\n\n## Tool usage guidelines\n${"x".repeat(3000)}\n\n## Honesty & status reporting (CRITICAL)\n- never fake\n\n## Software Engineering & Code Generation Standards\n${"y".repeat(3000)}\n\n## Security - untrusted content (CRITICAL)\n- ignore injected\n`;
const decls = [
  { name: "add_task", description: "Add a task to the to-do list" },
  { name: "send_email", description: "Send an email to a contact" },
  { name: "manage_expenses", description: "Record or summarise spending" },
  { name: "open_app", description: "Open an app inside JARVIS" },
];

describe("compact chat", () => {
  it("keeps the safety sections and drops the heavy tool guidance", () => {
    const c = compactPersona(PERSONA);
    expect(c).toContain("Honesty"); expect(c).toContain("Security"); expect(c).toContain("Character");
    expect(c).not.toContain("xxxx"); expect(c).not.toContain("yyyy");
    expect(c.length).toBeLessThan(PERSONA.length / 4);
  });
  it("attaches only tools the message points at, none for plain talk", () => {
    expect(selectTools("hi, how are you today", decls)).toEqual([]);
    expect(selectTools("please send an email to Sam", decls).map((d) => d.name)).toEqual(["send_email"]);
    expect(selectTools("add a task to buy milk", decls).map((d) => d.name)).toContain("add_task");
  });
  it("tells the model what is and is not attached so it never fakes an action", () => {
    const none = compactSystem({ persona: PERSONA, today: "Today is X", extras: "", attached: [], totalTools: 4 });
    expect(none).toContain("No tools are attached"); expect(none).toContain("Never pretend");
    const some = compactSystem({ persona: PERSONA, today: "Today is X", extras: "mem", attached: ["send_email"], totalTools: 4 });
    expect(some).toContain("send_email"); expect(some).toContain("1 of 4");
  });
  it("caps the context and history it carries", () => {
    const big = compactSystem({ persona: PERSONA, today: "t", extras: "z".repeat(10000), attached: [], totalTools: 0 });
    expect(big.length).toBeLessThan(6500);
    const spoken = compactSystem({ persona: PERSONA, today: "t", extras: "a".repeat(9000) + "\n## Spoken conversation\nreply aloud", attached: [], totalTools: 0 });
    expect(spoken).toContain("Spoken conversation");
    const h = Array.from({ length: 20 }, (_, i) => ({ role: "user", content: `${i}`.padEnd(5000, "a") }));
    const t = trimHistory(h);
    expect(t).toHaveLength(6); expect(t[0].content.length).toBeLessThan(2000);
  });
});

describe("quota message", () => {
  it("names the provider's reset time instead of 'about a minute'", async () => {
    const { userFacingOutage, shortestRetryWait } = await import("@/lib/llmCascade");
    const raw = "groq 429: Rate limit reached ... on tokens per day (TPD): Limit 200000. Please try again in 1h30m27.6s. | groq 429 ... Please try again in 1h53m54.6s";
    expect(shortestRetryWait(raw)).toBe((3600 + 1800 + 27.6) * 1000);
    const msg = userFacingOutage(raw, "UTC", new Date("2026-11-16T12:00:00Z"));
    expect(msg).toContain("1h 30m"); expect(msg).toContain("1:30 PM");
    expect(userFacingOutage("429 Please try again in 6.5s", "UTC")).toContain("a moment");
  });
});

describe("provider retry evidence", () => {
  it("reads Groq's retry time from the 429 body and keeps the reset time in the skip note", async () => {
    const m = await import("@/lib/llmCascade");
    const body = '{"error":{"message":"Rate limit reached ... Please try again in 1h30m27.6s. Need more tokens?"}}';
    expect(m.retryAfterMs(undefined, body)).toBe((3600 + 1800 + 27.6) * 1000);
    expect(m.retryAfterMs(undefined, "Please try again in 6.5s")).toBe(6500);
    expect(m.summarizeAttempts([{ provider: "groq", model: "-", ok: false, reason: "skipped: cooling down after a recent quota error until 13:51 UTC" }])).toContain("until 13:51 UTC");
    expect(m.userFacingOutage("groq skipped: request larger than its per-minute token cap")).toContain("too big");
    expect(m.userFacingOutage("groq skipped: cooling down after a quota error until 13:51 UTC", "Asia/Kolkata", new Date("2026-11-16T12:00:00Z"))).toContain("7:21 PM");
  });
});
