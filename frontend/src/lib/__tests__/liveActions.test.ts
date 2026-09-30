import { describe, expect, it } from "vitest";

import { classifyOpenUrl, directTurn, gmailComposeUrl } from "@/lib/liveActions";
import { systemStatus, usableGeminiKey } from "@/lib/providerReady";

describe("direct open", () => {
  it("opens an in-app page without a model", () => {
    const turn = directTurn("open my tasks");
    expect(turn?.sideEffects[0].data.url).toBe("/tasks");
    expect(turn?.confirms).toEqual([]);
  });

  it("strips a spoken lead-in", () => {
    const turn = directTurn("hey jarvis please go to kolab");
    expect(turn?.sideEffects[0].data.url).toBe("/kolab");
  });

  it("opens an external site", () => {
    const turn = directTurn("open youtube");
    expect(turn?.sideEffects[0].data.url).toContain("youtube.com");
  });

  it("passes a search through to the site", () => {
    const turn = directTurn("open youtube for lo-fi beats");
    expect(turn?.sideEffects[0].data.url).toContain("search_query=");
  });

  it("opens a second named app in the same breath", () => {
    const turn = directTurn("open youtube and spotify");
    const urls = turn?.sideEffects.map((s) => s.data.url) ?? [];
    expect(urls.some((u) => String(u).includes("youtube.com"))).toBe(true);
    expect(urls.some((u) => String(u).includes("spotify.com"))).toBe(true);
  });

  it("leaves a half-formed compound to the model", () => {
    expect(directTurn("open my tasks and add milk")).toBeNull();
  });

  it("does not treat a question as navigation", () => {
    expect(directTurn("what is on my tasks")).toBeNull();
  });

  it("does not navigate away on a name that is not a known page", () => {
    expect(directTurn("go to sleep")).toBeNull();
  });
});

describe("direct email", () => {
  it("builds a confirmable send from a spoken command", () => {
    const turn = directTurn("send an email to ada@example.com about the deck saying it is ready");
    const email = turn?.confirms[0];
    expect(email?.tool).toBe("communicate");
    expect(email?.args.to).toBe("ada@example.com");
    expect(email?.args.subject).toMatch(/deck/i);
    expect(email?.args.body).toMatch(/ready/i);
    expect(email?.args.action).toBe("email");
    expect(email?.clientAction).toBe(false);
  });

  it("does not send when the user is only reading mail", () => {
    expect(directTurn("check my email")).toBeNull();
  });

  it("does not invent a recipient", () => {
    expect(directTurn("send an email about lunch")).toBeNull();
  });

  it("strips header injection out of the subject", () => {
    const turn = directTurn("email ada@example.com subject Hello\r\nBcc: evil@x.com");
    expect(String(turn?.confirms[0]?.args.subject)).not.toMatch(/[\r\n]/);
  });

  it("keeps an and inside the body when the rest is not a command", () => {
    const turn = directTurn("email ada@example.com about the deck and the budget saying both are ready");
    expect(turn?.confirms).toHaveLength(1);
    expect(turn?.confirms[0].args.subject).toMatch(/deck and the budget/i);
    expect(turn?.sideEffects).toEqual([]);
  });
});

describe("direct live actions", () => {
  const now = new Date("2026-09-30T09:00:00Z");

  it("creates a task and opens the page in one turn", () => {
    const turn = directTurn("open my tasks and add a task to buy milk");
    expect(turn?.sideEffects.map((s) => s.type)).toEqual(["task_create", "open_url"]);
    expect(turn?.sideEffects[0].data).toMatchObject({ title: "buy milk", priority: "medium", status: "todo" });
    expect(turn?.sideEffects[1].data.url).toBe("/tasks");
  });

  it("marks a matching task done and refuses a miss", () => {
    const tasks = [{ id: "t1", title: "Buy milk", status: "todo" }];
    const done = directTurn("mark buy milk done", { tasks });
    expect(done?.sideEffects[0]).toMatchObject({ type: "task_update", data: { id: "t1", patch: { status: "done" } } });
    const miss = directTurn("mark the gym task done", { tasks });
    expect(miss?.sideEffects).toEqual([]);
    expect(miss?.text).toMatch(/wasn't|nothing was changed/i);
  });

  it("saves a note, a goal, and an expense", () => {
    expect(directTurn("make a note about the vendor call")?.sideEffects[0]).toMatchObject({
      type: "note_create",
      data: { content: "the vendor call" },
    });
    expect(directTurn("set a goal to run a 5k")?.sideEffects[0].type).toBe("goal_create");
    const expense = directTurn("log an expense of ₹250 for coffee");
    expect(expense?.sideEffects[0]).toMatchObject({ type: "expense_create", data: { amount: 250 } });
  });

  it("opens whatsapp, sms, and the dialer without a confirm card", () => {
    const wa = directTurn("whatsapp 919876543210 saying on my way");
    expect(String(wa?.sideEffects[0].data.url)).toContain("wa.me/919876543210");
    expect(wa?.confirms).toEqual([]);
    expect(String(directTurn("text 5551234567 saying hello")?.sideEffects[0].data.url)).toMatch(/^sms:/);
    expect(String(directTurn("call 5551234567")?.sideEffects[0].data.url)).toBe("tel:5551234567");
  });

  it("asks before paying", () => {
    const turn = directTurn("pay 500 to ravi@oksbi for lunch");
    expect(turn?.sideEffects).toEqual([]);
    expect(turn?.confirms[0]).toMatchObject({ tool: "pay", clientAction: true });
    expect(turn?.confirms[0].url).toMatch(/^upi:\/\/pay/);
  });

  it("opens directions, music, and a calendar draft", () => {
    expect(String(directTurn("directions to the airport")?.sideEffects[0].data.url)).toContain("google.com/maps");
    expect(String(directTurn("play lo-fi beats on spotify")?.sideEffects[0].data.url)).toContain("open.spotify.com/search/");
    expect(String(directTurn("add standup to my calendar")?.sideEffects[0].data.url)).toContain("calendar.google.com");
  });

  it("queues a device change and a sleep protocol", () => {
    expect(directTurn("turn on the flashlight")?.sideEffects[0]).toMatchObject({
      type: "device_action",
      data: { action: "flashlight_on" },
    });
    const night = directTurn("good night");
    expect(night?.text).toMatch(/sleep/i);
    expect(night?.sideEffects.some((s) => s.type === "home_action" || s.type === "device_action")).toBe(true);
  });

  it("sets a reminder only when the time is explicit", () => {
    const turn = directTurn("remind me in 20 minutes to stretch", { now, timezone: "UTC" });
    expect(turn?.reminders[0].title).toBe("stretch");
    expect(turn?.reminders[0].fire_at).toBe("2026-09-30T09:20:00+00:00");
    expect(directTurn("remind me to stretch")).toBeNull();
  });
});

describe("gmail compose url", () => {
  it("pre-fills to, subject and body", () => {
    const url = gmailComposeUrl("ada@example.com", "Hello", "Body line");
    expect(url.startsWith("https://mail.google.com/mail/?")).toBe(true);
    const q = new URL(url).searchParams;
    expect(q.get("to")).toBe("ada@example.com");
    expect(q.get("su")).toBe("Hello");
    expect(q.get("body")).toBe("Body line");
  });

  it("cannot smuggle a second header", () => {
    const url = gmailComposeUrl("ada@example.com", "Hi\r\nBcc: evil@x.com", "Body");
    expect(url).not.toMatch(/[\r\n]/);
    expect(new URL(url).searchParams.get("su")).toBe("Hi Bcc: evil@x.com");
  });
});

describe("classifyOpenUrl", () => {
  it("keeps in-app routes in the app", () => {
    expect(classifyOpenUrl("/tasks")).toBe("internal");
  });

  it("rejects protocol-relative urls", () => {
    expect(classifyOpenUrl("//evil.example")).toBe("reject");
  });

  it("treats https as a new tab and tel as a scheme", () => {
    expect(classifyOpenUrl("https://youtube.com")).toBe("web");
    expect(classifyOpenUrl("tel:+15551212")).toBe("scheme");
  });
});

describe("system status", () => {
  const base = {
    GEMINI_API_KEY: "",
    GOOGLE_API_KEY: "",
    ANTHROPIC_API_KEY: "",
    OPENAI_API_KEY: "",
    GROQ_API_KEY: "",
    DATABASE_URL: "",
    GOOGLE_CLIENT_ID: "",
    GOOGLE_CLIENT_SECRET: "",
    SERPER_API_KEY: "",
    XAI_API_KEY: "",
    CEREBRAS_API_KEY: "",
    OPENROUTER_API_KEY: "",
    MISTRAL_API_KEY: "",
  };

  it("does not treat a short placeholder as Gemini", () => {
    expect(usableGeminiKey({ ...base, GEMINI_API_KEY: "ci-placeholder" })).toBe("");
    const status = systemStatus({ ...base, GEMINI_API_KEY: "ci-placeholder" });
    expect(status.ai).toBe(true);
    expect(status.openai).toBe(false);
    expect(status.serper).toBe(false);
  });

  it("counts a real Gemini key as whisper and web search", () => {
    const key = "AIza" + "x".repeat(35);
    const status = systemStatus({ ...base, GEMINI_API_KEY: key });
    expect(status.openai).toBe(true);
    expect(status.serper).toBe(true);
  });

  it("counts explicit OpenAI and Serper keys on their own", () => {
    const status = systemStatus({ ...base, OPENAI_API_KEY: "sk-test", SERPER_API_KEY: "serper" });
    expect(status.openai).toBe(true);
    expect(status.serper).toBe(true);
  });
});
