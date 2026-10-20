import { describe, expect, it } from "vitest";

import { geminiTools } from "@/lib/tools/schemas";
import {
  ACTIVITIES, DAYLOG_KEY, LOG_KINDS, activityBrief, addEntry, matchActivities, mergeLogs, readLog, summarize, type Who,
} from "@/lib/dailyLife";

type Prop = { type?: string; enum?: string[] };
type Decl = { name: string; parameters?: { properties?: Record<string, Prop> } };
const decls: Decl[] = geminiTools.flatMap((t: { functionDeclarations: Decl[] }) => t.functionDeclarations);
const byName = new Map(decls.map((d) => [d.name, d]));

describe("everyday activity catalog", () => {
  it("only names tools and arguments that exist, with valid enum values", () => {
    const problems: string[] = [];
    for (const a of ACTIVITIES) {
      for (const r of a.run) {
        const decl = byName.get(r.tool);
        if (!decl) { problems.push(`${a.id}: no tool ${r.tool}`); continue; }
        const props = decl.parameters?.properties ?? {};
        for (const [k, v] of Object.entries(r.args)) {
          if (v === undefined) continue;
          if (!props[k]) problems.push(`${a.id}: ${r.tool} has no argument ${k}`);
          else if (props[k].enum && typeof v === "string" && !v.startsWith("<") && !props[k].enum!.includes(v)) problems.push(`${a.id}: ${r.tool}.${k}=${v} not in enum`);
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it("gives every activity steps and at least one way to carry it out, with unique ids", () => {
    for (const a of ACTIVITIES) {
      expect(a.steps.length, a.id).toBeGreaterThan(0);
      expect(a.run.length, a.id).toBeGreaterThan(0);
    }
    expect(new Set(ACTIVITIES.map((a) => a.id)).size).toBe(ACTIVITIES.length);
  });

  it("covers every group in a household", () => {
    const groups: Who[] = ["everyone", "women", "men", "parents", "kids", "elders", "pets", "home"];
    for (const g of groups) expect(ACTIVITIES.some((a) => a.who.includes(g)), g).toBe(true);
  });

  it("logs every kind the log_activity tool accepts", () => {
    const kinds = byName.get("log_activity")!.parameters!.properties!.kind.enum;
    expect(kinds).toEqual([...LOG_KINDS]);
  });
});

describe("matching a message to the right activity and tool", () => {
  const cases: [string, string, string][] = [
    ["wake me up at 6", "wake", "manage_reminders"],
    ["I slept 6 hours last night", "sleep", "log_activity"],
    ["remind me to drink water every 2 hours", "water", "log_activity"],
    ["I did 8,000 steps today", "walk", "log_activity"],
    ["went for a run, 30 minutes", "workout", "log_activity"],
    ["log 15 minutes of meditation", "yoga", "log_activity"],
    ["what did I eat for lunch", "meal", "log_activity"],
    ["order milk and eggs on blinkit", "groceries", "open_app"],
    ["remind me to take my thyroid tablet at 9", "medicine", "manage_reminders"],
    ["my weight is 72 kg", "health_numbers", "log_activity"],
    ["feeling low today", "mood", "log_activity"],
    ["remind me to take a break every hour", "break", "manage_reminders"],
    ["book a dentist for Friday", "doctor", "manage_calendar"],
    ["get me a cab to the airport", "ride", "book_ride"],
    ["pay the electricity bill", "bills", "manage_reminders"],
    ["pay rent to my landlord", "rent", "pay"],
    ["call my mom", "family_call", "communicate"],
    ["it's Priya's birthday next week", "birthday", "manage_calendar"],
    ["my period started today", "period", "log_activity"],
    ["when is my next period due", "period", "log_activity"],
    ["remind me to take my prenatal vitamin", "pregnancy", "manage_reminders"],
    ["set a monthly breast self-exam reminder", "breast_check", "manage_reminders"],
    ["remind me about a testicular self-exam", "mens_health", "manage_reminders"],
    ["book a haircut", "grooming", "open_app"],
    ["school pickup at 3pm on weekdays", "school", "manage_reminders"],
    ["my son has homework due Monday", "homework", "manage_tasks"],
    ["pack the tiffin", "lunchbox", "manage_reminders"],
    ["baby fed 120 ml", "baby", "log_activity"],
    ["the baby's vaccination is due", "baby", "log_activity"],
    ["remind me about my daughter's vaccination", "vaccination", "manage_calendar"],
    ["swimming class every Saturday", "kids_activity", "manage_reminders"],
    ["check on my elderly father weekly", "elder_care", "manage_reminders"],
    ["feed the dog at 8", "pet_feed", "log_activity"],
    ["walk the dog", "pet_walk", "log_activity"],
    ["I walked the dog for 20 minutes", "pet_walk", "log_activity"],
    ["fed the cat", "pet_feed", "log_activity"],
    ["find a vet near me", "vet", "navigate"],
    ["clean the litter box daily", "pet_grooming", "manage_reminders"],
    ["do the laundry on Sunday", "chores", "manage_reminders"],
    ["need a plumber, the sink has a leak", "repairs", "open_app"],
    ["water the plants every morning", "plants", "manage_reminders"],
    ["I'm home", "home_mode", "initiate_protocol"],
  ];
  it.each(cases)("%s -> %s via %s", (text, id, tool) => {
    const [first] = matchActivities(text);
    expect(first?.id).toBe(id);
    expect(first.run[0].tool).toBe(tool);
  });

  it.each([
    "break this project into steps",
    "run the quarterly report",
    "automate my emails",
    "business cycle analysis",
    "give me feedback on my deck",
    "schedule a meeting appointment with the team",
    "summarise this pdf",
  ])("leaves work requests alone: %s", (text) => {
    expect(matchActivities(text)).toEqual([]);
    expect(activityBrief(text)).toBe("");
  });

  it("offers both readings of a message that touches two activities", () => {
    expect(matchActivities("remind me to take my blood pressure tablet").map((a) => a.id)).toEqual(["health_numbers", "medicine"]);
  });

  it("lists several activities in one message, in the order they were asked", () => {
    expect(matchActivities("feed the dog, then drink water and walk the dog").map((a) => a.id)).toEqual(["pet_feed", "water", "pet_walk"]);
  });

  it("writes a brief naming the tool, the steps and the rest note", () => {
    const b = activityBrief("I want to go for a run");
    expect(b).toContain("`log_activity`");
    expect(b).toContain("Steps:");
    expect(b).toContain("Rest/recovery: Rest 48 hours");
  });
});

describe("the activity log", () => {
  const at = (iso: string) => new Date(iso);

  it("totals a day in the user's own time zone", () => {
    const store: Record<string, string> = {};
    // 20:00 UTC on the 1st is already the 2nd in India.
    addEntry(store, { kind: "water", amount: 250 }, at("2026-10-01T20:00:00Z"), "Asia/Kolkata");
    addEntry(store, { kind: "water", amount: 500 }, at("2026-10-02T04:00:00Z"), "Asia/Kolkata");
    const s = summarize(store, "today", at("2026-10-02T05:00:00Z"), "Asia/Kolkata", "water");
    expect(s).toContain("today (2026-10-02)");
    expect(s).toContain("2 entries - total 750 ml");
  });

  it("keeps who it was for and the note", () => {
    const store: Record<string, string> = {};
    const e = addEntry(store, { kind: "pet_walk", amount: 30, subject: "Bruno", note: "park" }, at("2026-10-02T06:00:00Z"), "UTC");
    expect(e).toMatchObject({ k: "pet_walk", a: 30, u: "min", s: "Bruno", n: "park", t: "06:00" });
    expect(summarize(store, "today", at("2026-10-02T07:00:00Z"), "UTC")).toContain("[Bruno]");
  });

  it("drops entries older than 90 days", () => {
    const store: Record<string, string> = {};
    addEntry(store, { kind: "steps", amount: 1000 }, at("2026-01-01T10:00:00Z"), "UTC");
    addEntry(store, { kind: "steps", amount: 2000 }, at("2026-10-01T10:00:00Z"), "UTC");
    expect(readLog(store).map((e) => e.a)).toEqual([2000]);
  });

  it("predicts the next period from logged starts", () => {
    const store: Record<string, string> = {};
    addEntry(store, { kind: "period", note: "start" }, at("2026-07-01T08:00:00Z"), "UTC");
    addEntry(store, { kind: "period", note: "start" }, at("2026-07-31T08:00:00Z"), "UTC");
    addEntry(store, { kind: "period", note: "start" }, at("2026-08-30T08:00:00Z"), "UTC");
    const s = summarize(store, "month", at("2026-09-02T08:00:00Z"), "UTC", "period");
    expect(s).toContain("Average cycle 30 days (from 2 logged cycles)");
    expect(s).toContain("Next expected around 2026-09-29");
  });

  it("falls back to a 28-day estimate and says so", () => {
    const store: Record<string, string> = {};
    addEntry(store, { kind: "period", note: "started today" }, at("2026-09-01T08:00:00Z"), "UTC");
    expect(summarize(store, "today", at("2026-09-01T09:00:00Z"), "UTC", "period")).toContain("Next expected around 2026-09-29");
  });

  it("averages a week per day", () => {
    const store: Record<string, string> = {};
    addEntry(store, { kind: "steps", amount: 4000 }, at("2026-10-01T10:00:00Z"), "UTC");
    addEntry(store, { kind: "steps", amount: 6000 }, at("2026-10-02T10:00:00Z"), "UTC");
    expect(summarize(store, "week", at("2026-10-02T12:00:00Z"), "UTC", "steps")).toContain("total 10000 steps, about 5000/day");
  });

  it("says when nothing is logged", () => {
    expect(summarize({}, "today", at("2026-10-02T12:00:00Z"), "UTC", "water")).toBe("Nothing logged for water today.");
  });

  it("merges the server's log with a device's stale copy without losing either side", () => {
    const phone: Record<string, string> = {};
    const laptop: Record<string, string> = {};
    addEntry(phone, { kind: "water", amount: 250 }, at("2026-10-02T08:00:00Z"), "UTC");
    laptop[DAYLOG_KEY] = phone[DAYLOG_KEY];
    addEntry(phone, { kind: "steps", amount: 3000 }, at("2026-10-02T09:00:00Z"), "UTC");
    addEntry(laptop, { kind: "meal", note: "dal rice" }, at("2026-10-02T13:00:00Z"), "UTC");
    const merged = readLog({ [DAYLOG_KEY]: mergeLogs(phone[DAYLOG_KEY], laptop[DAYLOG_KEY]) });
    expect(merged.map((e) => e.k)).toEqual(["water", "steps", "meal"]);
  });

  it("reads a damaged value as an empty log", () => {
    expect(readLog({ [DAYLOG_KEY]: "not json" })).toEqual([]);
  });
});
