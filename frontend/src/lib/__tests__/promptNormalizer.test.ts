import { describe, it, expect } from "vitest";
import {
  cleanMessage,
  detectIntents,
  findRecurrence,
  findReferents,
  isoInZone,
  normalizePrompt,
  resolveTimes,
} from "@/lib/promptNormalizer";

// Tuesday 25 Aug 2026, 14:32:10 IST (09:02:10 UTC). India has no DST, which
// keeps the arithmetic in most tests obvious.
const IST = "Asia/Kolkata";
const NOW = new Date("2026-08-25T09:02:10.000Z");

describe("cleanMessage", () => {
  it("strips the wake word", () => {
    expect(cleanMessage("Hey Jarvis, what's the weather")).toBe("what's the weather");
    expect(cleanMessage("jarvis remind me at 6")).toBe("remind me at 6");
  });

  it("strips leading filler and trailing pleasantries", () => {
    expect(cleanMessage("umm so add a task to call the vendor please")).toBe("add a task to call the vendor");
  });

  it("collapses the whitespace STT leaves behind", () => {
    expect(cleanMessage("  what   is   the    time  ")).toBe("what is the time");
  });

  it("never returns empty", () => {
    expect(cleanMessage("Jarvis")).toBe("Jarvis");
    expect(cleanMessage("please")).toBe("please");
  });
});

// CodeQL flagged four polynomial-backtracking regexes here (this runs on raw
// request input, so a stall is a real DoS). These pin the linear behaviour: the
// pre-fix patterns took minutes on these strings, so a regression trips the
// budget rather than merely getting slower.
describe("resistance to adversarial input (ReDoS)", () => {
  const BUDGET_MS = 1_000;

  const attacks: Array<[string, string]> = [
    ["tabs", "jarvis" + "\t".repeat(40_000)],
    ["bangs", "add a task thanks" + "!".repeat(40_000)],
    ["at-signs", "email " + "!@".repeat(20_000)],
    ["spaces before a pleasantry", "add a task" + " ".repeat(40_000) + "please"],
    ["filler run", "um ".repeat(20_000) + "add a task"],
    ["commas", "jarvis" + ",".repeat(40_000)],
    ["near-miss address", "email me at " + "a".repeat(40_000)],
  ];

  for (const [label, payload] of attacks) {
    it(`cleans ${label} in linear time`, () => {
      const started = Date.now();
      cleanMessage(payload);
      expect(Date.now() - started).toBeLessThan(BUDGET_MS);
    });

    it(`normalizes ${label} in linear time`, () => {
      const started = Date.now();
      normalizePrompt({ message: payload, timezone: IST, now: NOW, capabilities: { gmailSend: true } });
      expect(Date.now() - started).toBeLessThan(BUDGET_MS);
    });
  }

  it("caps the excerpt it echoes back into the prompt", () => {
    const n = normalizePrompt({
      message: `jarvis ${"the quick brown fox ".repeat(500)}`,
      timezone: IST,
      now: NOW,
    });
    // The wake word was stripped, so the brief echoes the cleaned text — but
    // bounded, or a long paste would balloon the system instruction.
    expect(n.brief).toContain("chars total)");
    expect(n.brief.length).toBeLessThan(2_000);
    expect(n.cleaned.length).toBeGreaterThan(2_000); // full value still intact
  });

  it("keeps the full message while only bounding what it scans", () => {
    // The scan window is capped, but `cleaned` must stay whole — it is what the
    // rest of the turn reasons about, and truncating it would silently drop
    // the user's content.
    const paste = "lorem ipsum ".repeat(5_000);
    const n = normalizePrompt({ message: `remind me tomorrow at 7am: ${paste}`, timezone: IST, now: NOW });
    expect(n.cleaned.length).toBeGreaterThan(50_000);
    expect(n.cleaned.endsWith("lorem ipsum")).toBe(true);
    // An instruction at the front is still resolved despite the cap.
    expect(n.times[0].iso).toBe("2026-08-26T07:00:00+05:30");
    expect(n.intents.map((i) => i.tool)).toContain("manage_reminders");
  });
});

describe("isoInZone", () => {
  it("renders the instant in the target zone with its offset", () => {
    expect(isoInZone(NOW, IST)).toBe("2026-08-25T14:32:10+05:30");
    expect(isoInZone(NOW, "UTC")).toBe("2026-08-25T09:02:10+00:00");
  });
});

describe("resolveTimes", () => {
  it("resolves a relative duration exactly", () => {
    const [t] = resolveTimes("remind me in 20 minutes", NOW, IST);
    expect(t.iso).toBe("2026-08-25T14:52:10+05:30");
  });

  it("handles 'in an hour'", () => {
    const [t] = resolveTimes("ping me in an hour", NOW, IST);
    expect(t.iso).toBe("2026-08-25T15:32:10+05:30");
  });

  it("resolves tomorrow with an explicit meridiem", () => {
    const [t] = resolveTimes("remind me tomorrow at 7am to call the vendor", NOW, IST);
    expect(t.iso).toBe("2026-08-26T07:00:00+05:30");
    expect(t.assumed).toBeUndefined();
  });

  it("keeps minutes and pm", () => {
    const [t] = resolveTimes("meeting tomorrow at 3:45 pm", NOW, IST);
    expect(t.iso).toBe("2026-08-26T15:45:00+05:30");
  });

  it("reads a bare hour today as the next occurrence", () => {
    // 14:32 now, so "at 7" means 19:00 today, not 07:00.
    const [t] = resolveTimes("remind me at 7", NOW, IST);
    expect(t.iso).toBe("2026-08-25T19:00:00+05:30");
    expect(t.assumed).toMatch(/next occurrence/);
  });

  it("rolls to tomorrow when both readings of a bare hour have passed", () => {
    const [t] = resolveTimes("remind me at 9", NOW, IST); // 09:00 and 21:00...
    expect(t.iso).toBe("2026-08-25T21:00:00+05:30"); // 21:00 is still ahead
    const late = new Date("2026-08-25T17:00:00.000Z"); // 22:30 IST
    const [t2] = resolveTimes("remind me at 9", late, IST);
    expect(t2.iso).toBe("2026-08-26T09:00:00+05:30");
  });

  it("uses the stated part of day to disambiguate", () => {
    const [t] = resolveTimes("call me at 8 in the evening", NOW, IST);
    expect(t.iso).toBe("2026-08-25T20:00:00+05:30");
  });

  it("defaults a part-of-day phrase with no clock", () => {
    const [t] = resolveTimes("remind me tomorrow morning", NOW, IST);
    expect(t.iso).toBe("2026-08-26T09:00:00+05:30");
    expect(t.assumed).toMatch(/morning/);
  });

  it("resolves tonight", () => {
    const [t] = resolveTimes("remind me tonight", NOW, IST);
    expect(t.iso).toBe("2026-08-25T21:00:00+05:30");
  });

  it("resolves day after tomorrow", () => {
    const [t] = resolveTimes("the day after tomorrow at 10am", NOW, IST);
    expect(t.iso).toBe("2026-08-27T10:00:00+05:30");
  });

  it("resolves an upcoming weekday, never today", () => {
    // NOW is a Tuesday, so the upcoming Monday is 6 days out.
    const [mon] = resolveTimes("next monday at 11am", NOW, IST);
    expect(mon.iso).toBe("2026-08-31T11:00:00+05:30");
    const [fri] = resolveTimes("friday at 11am", NOW, IST);
    expect(fri.iso).toBe("2026-08-28T11:00:00+05:30");
  });

  it("accepts spelled-out hours from speech recognition", () => {
    const [t] = resolveTimes("remind me tomorrow at five pm", NOW, IST);
    expect(t.iso).toBe("2026-08-26T17:00:00+05:30");
  });

  it("reads a 24-hour clock without assuming", () => {
    const [t] = resolveTimes("tomorrow at 19:30", NOW, IST);
    expect(t.iso).toBe("2026-08-26T19:30:00+05:30");
    expect(t.assumed).toBeUndefined();
  });

  it("emits nothing when there is no time reference", () => {
    expect(resolveTimes("what is the capital of France", NOW, IST)).toEqual([]);
  });

  it("does not mistake an unrelated number for a clock time", () => {
    expect(resolveTimes("add 3 tasks for the launch", NOW, IST)).toEqual([]);
  });

  it("crosses a DST boundary using the offset at the target, not now", () => {
    // New York, late Oct 2026: EDT (-04:00) now, EST (-05:00) after 1 Nov.
    const octNow = new Date("2026-10-30T14:00:00.000Z"); // 10:00 EDT, a Friday
    const [t] = resolveTimes("next tuesday at 9am", octNow, "America/New_York");
    expect(t.iso).toBe("2026-11-03T09:00:00-05:00");
  });
});

describe("findRecurrence", () => {
  it("picks up recurring phrasing", () => {
    expect(findRecurrence("remind me every morning at 7")).toBe("every morning");
    expect(findRecurrence("send me a daily digest")).toBe("daily");
    expect(findRecurrence("remind me tomorrow")).toBeUndefined();
  });
});

describe("detectIntents", () => {
  it("finds a single intent", () => {
    const { intents } = detectIntents("what's the weather in Delhi");
    expect(intents).toHaveLength(1);
    expect(intents[0].tool).toBe("get_weather");
  });

  it("finds every intent in a compound request, in spoken order", () => {
    const { intents } = detectIntents("remind me at 6 to call the vendor and then tell me the weather");
    expect(intents.map((i) => i.tool)).toEqual(["manage_reminders", "get_weather"]);
  });

  it("routes task creation and completion distinctly", () => {
    expect(detectIntents("add a task to ship the deck").intents[0]).toMatchObject({
      tool: "manage_tasks",
      action: "create",
    });
    expect(detectIntents("mark that done").intents[0]).toMatchObject({
      tool: "manage_tasks",
      action: "update",
    });
  });

  it("flags an intent whose integration is not connected", () => {
    const { intents, unavailable } = detectIntents("turn off the lights", { smartHome: false });
    expect(intents[0].tool).toBe("control_device");
    expect(unavailable.join(" ")).toMatch(/Smart home/);
  });

  it("does not flag a connected integration", () => {
    const { unavailable } = detectIntents("check my email", { gmailRead: true });
    expect(unavailable).toEqual([]);
  });

  it("does not read a reminder's body as a phone call", () => {
    const { intents } = detectIntents("remind me at 6 to call the vendor");
    expect(intents.map((i) => i.tool)).toEqual(["manage_reminders"]);
  });

  it("still catches a real dial request", () => {
    expect(detectIntents("call +91 98765 43210").intents[0]).toMatchObject({
      tool: "communicate",
      action: "call",
    });
    expect(detectIntents("call mom").intents[0]).toMatchObject({ action: "call" });
  });

  it("de-duplicates repeated phrasing", () => {
    const { intents } = detectIntents("search the web, just search for it");
    expect(intents.filter((i) => i.tool === "web_search")).toHaveLength(1);
  });
});

describe("findReferents", () => {
  const tasks = [
    { id: "t1", title: "Ship the vendor deck", status: "todo" },
    { id: "t2", title: "Pay the electricity bill", status: "done" },
  ];

  it("maps a pronoun to the most recent open task", () => {
    const [r] = findReferents("mark that done", tasks);
    expect(r).toMatchObject({ id: "t1", label: "Ship the vendor deck" });
  });

  it("returns nothing without a pronoun", () => {
    expect(findReferents("mark the vendor deck done", tasks)).toEqual([]);
  });

  it("returns nothing when there are no open tasks", () => {
    expect(findReferents("mark that done", [{ id: "t2", title: "x", status: "done" }])).toEqual([]);
  });
});

describe("normalizePrompt", () => {
  it("builds a brief carrying the anchor, resolved time and intents", () => {
    const n = normalizePrompt({
      message: "Hey Jarvis, remind me tomorrow at 7am to call the vendor and what's the weather?",
      timezone: IST,
      now: NOW,
      capabilities: { reminders: true, webSearch: true },
    });

    expect(n.cleaned).toBe("remind me tomorrow at 7am to call the vendor and what's the weather?");
    expect(n.anchor.iso).toBe("2026-08-25T14:32:10+05:30");
    expect(n.anchor.weekday).toBe("Tuesday");
    expect(n.times[0].iso).toBe("2026-08-26T07:00:00+05:30");
    expect(n.intents.map((i) => i.tool)).toEqual(["manage_reminders", "get_weather"]);
    expect(n.missing).toEqual([]);

    expect(n.brief).toContain("2026-08-26T07:00:00+05:30");
    expect(n.brief).toContain("manage_reminders(set)");
    expect(n.brief).toContain("more than one intent");
  });

  it("preserves the original message untouched", () => {
    const raw = "Jarvis  please   remind me at 6 ";
    const n = normalizePrompt({ message: raw, timezone: IST, now: NOW });
    expect(n.original).toBe(raw);
  });

  it("reports a reminder with no resolvable time as missing, not guessed", () => {
    const n = normalizePrompt({
      message: "remind me to call the vendor",
      timezone: IST,
      now: NOW,
      capabilities: { reminders: true },
    });
    expect(n.times).toEqual([]);
    expect(n.missing.join(" ")).toMatch(/fire_at/);
    expect(n.brief).toContain("ask one short question");
  });

  it("names the missing recipient for an email request", () => {
    const n = normalizePrompt({
      message: "send an email about the delay",
      timezone: IST,
      now: NOW,
      capabilities: { gmailSend: true },
    });
    expect(n.missing.join(" ")).toMatch(/recipient/);
  });

  it("warns the model when a capability is not connected", () => {
    const n = normalizePrompt({
      message: "how many steps did I walk today",
      timezone: IST,
      now: NOW,
      capabilities: { health: false },
    });
    expect(n.brief).toContain("never imply success");
    expect(n.unavailable.join(" ")).toMatch(/Health/);
  });

  it("labels assumptions so the agent can confirm them", () => {
    const n = normalizePrompt({ message: "remind me at 7", timezone: IST, now: NOW });
    expect(n.times[0].assumed).toBeTruthy();
    expect(n.brief).toContain("[assumed:");
    expect(n.brief).toContain("confirm before any irreversible action");
  });

  it("falls back to UTC without a timezone instead of throwing", () => {
    const n = normalizePrompt({ message: "remind me tomorrow at 7am", now: NOW });
    expect(n.anchor.timezone).toBe("UTC");
    expect(n.times[0].iso).toBe("2026-08-26T07:00:00+00:00");
  });

  it("stays quiet for small talk", () => {
    const n = normalizePrompt({ message: "hello", timezone: IST, now: NOW });
    expect(n.intents).toEqual([]);
    expect(n.times).toEqual([]);
    expect(n.brief).toContain("Now: 2026-08-25T14:32:10+05:30");
  });
});
