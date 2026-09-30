import { describe, expect, it } from "vitest";

import { classifyOpenUrl, directTurn, gmailComposeUrl } from "@/lib/liveActions";
import { systemStatus, usableGeminiKey } from "@/lib/providerReady";

describe("direct open", () => {
  it("opens an in-app page without a model", () => {
    const turn = directTurn("open my tasks");
    expect(turn?.kind).toBe("open");
    if (turn?.kind !== "open") return;
    expect(turn.sideEffects[0].data.url).toBe("/tasks");
  });

  it("strips a spoken lead-in", () => {
    const turn = directTurn("hey jarvis please go to kolab");
    expect(turn?.kind).toBe("open");
    if (turn?.kind !== "open") return;
    expect(turn.sideEffects[0].data.url).toBe("/kolab");
  });

  it("opens an external site", () => {
    const turn = directTurn("open youtube");
    expect(turn?.kind).toBe("open");
    if (turn?.kind !== "open") return;
    expect(turn.sideEffects[0].data.url).toContain("youtube.com");
  });

  it("passes a search through to the site", () => {
    const turn = directTurn("open youtube for lo-fi beats");
    expect(turn?.kind).toBe("open");
    if (turn?.kind !== "open") return;
    expect(turn.sideEffects[0].data.url).toContain("search_query=");
  });

  it("leaves a compound request to the model", () => {
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
    expect(turn?.kind).toBe("email");
    if (turn?.kind !== "email") return;
    expect(turn.args.to).toBe("ada@example.com");
    expect(turn.args.subject).toMatch(/deck/i);
    expect(turn.args.body).toMatch(/ready/i);
    expect(turn.args.action).toBe("email");
  });

  it("does not send when the user is only reading mail", () => {
    expect(directTurn("check my email")).toBeNull();
  });

  it("does not invent a recipient", () => {
    expect(directTurn("send an email about lunch")).toBeNull();
  });

  it("strips header injection out of the subject", () => {
    const turn = directTurn("email ada@example.com subject Hello\r\nBcc: evil@x.com");
    expect(turn?.kind).toBe("email");
    if (turn?.kind !== "email") return;
    expect(turn.args.subject).not.toMatch(/[\r\n]/);
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
