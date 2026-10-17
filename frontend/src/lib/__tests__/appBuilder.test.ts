import { afterEach, describe, expect, it, vi } from "vitest";
import { parseAppFiles, publishApp, repoSlug } from "@/lib/appBuilder";
import { isSensitive, summarizeAction } from "@/lib/actions";

const block = (path: string, body: string) => `=== FILE: ${path} ===\n${body}\n=== END ===`;

describe("parseAppFiles", () => {
  it("reads every file the model wrote", () => {
    const out = parseAppFiles(`Here you go\n${block("index.html", "<!doctype html><h1>Hi</h1>")}\n${block("app.js", "console.log(1)")}`);
    expect(out).toEqual([
      { path: "index.html", content: "<!doctype html><h1>Hi</h1>" },
      { path: "app.js", content: "console.log(1)" },
    ]);
  });

  it("needs an index.html, because that is what Pages serves", () => {
    expect(parseAppFiles(block("app.js", "x"))).toMatch(/index\.html/);
  });

  it("refuses paths that escape the repo or files a static site can't use", () => {
    expect(parseAppFiles(`${block("index.html", "x")}\n${block("../evil.html", "x")}`)).toMatch(/path/);
    expect(parseAppFiles(`${block("index.html", "x")}\n${block("/etc/x.js", "x")}`)).toMatch(/path/);
    expect(parseAppFiles(`${block("index.html", "x")}\n${block("server.php", "x")}`)).toMatch(/path/);
    expect(parseAppFiles(`${block("index.html", "x")}\n${block(".github/workflows/x.yml", "x")}`)).toMatch(/path/);
  });

  it("caps the number and size of files", () => {
    const many = Array.from({ length: 25 }, (_, i) => block(i ? `f${i}.js` : "index.html", "x")).join("\n");
    expect(parseAppFiles(many)).toMatch(/files/);
    expect(parseAppFiles(block("index.html", "x".repeat(600_000)))).toMatch(/large/);
  });
});

describe("repoSlug", () => {
  it("makes a GitHub-safe name", () => {
    expect(repoSlug("My Todo App!")).toBe("my-todo-app");
    expect(repoSlug("  ")).toBe("jarvis-app");
    expect(repoSlug("a".repeat(200)).length).toBeLessThanOrEqual(60);
  });
});

describe("build_app is confirmed before it runs", () => {
  it("is sensitive and the card says it is public", () => {
    expect(isSensitive("build_app", { description: "a todo app" })).toBe(true);
    expect(summarizeAction("build_app", { name: "todo", description: "a todo app" })).toMatch(/public.*GitHub/i);
  });
});

describe("publishApp", () => {
  afterEach(() => vi.unstubAllGlobals());

  function github(over: { create?: number[]; pages?: number } = {}) {
    const calls: { method: string; path: string; body?: any }[] = [];
    const creates = [...(over.create ?? [201])];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit = {}) => {
      const path = new URL(url).pathname;
      const body = init.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ method: init.method ?? "GET", path, body });
      const reply = (status: number, json: unknown = {}) => ({ ok: status < 400, status, text: async () => JSON.stringify(json) });
      if (path === "/user/repos") {
        const s = creates.shift() ?? 201;
        return s === 201 ? reply(201, { full_name: `me/${body.name}`, name: body.name, owner: { login: "me" }, html_url: `https://github.com/me/${body.name}`, default_branch: "main" })
          : reply(s, { message: "name already exists on this account" });
      }
      if (path.includes("/contents/")) return reply(201, { content: {} });
      if (path.endsWith("/pages")) return reply(over.pages ?? 201, { html_url: `https://me.github.io/x/` });
      return reply(404);
    }));
    return calls;
  }

  const files = [{ path: "index.html", content: "<h1>Hi</h1>" }, { path: "js/app.js", content: "1" }];

  it("creates a public repo, pushes every file, and turns on Pages", async () => {
    const calls = github();
    const r = await publishApp("tok", "todo", "A todo app", files);
    expect(calls[0]).toMatchObject({ method: "POST", path: "/user/repos", body: { name: "todo", private: false } });
    const puts = calls.filter((c) => c.method === "PUT");
    expect(puts.map((c) => c.path)).toEqual(["/repos/me/todo/contents/index.html", "/repos/me/todo/contents/js/app.js"]);
    expect(Buffer.from(puts[0].body.content, "base64").toString()).toBe("<h1>Hi</h1>");
    expect(calls.at(-1)).toMatchObject({ method: "POST", path: "/repos/me/todo/pages", body: { source: { branch: "main", path: "/" } } });
    expect(r).toMatchObject({ repoUrl: "https://github.com/me/todo", pagesUrl: "https://me.github.io/todo/", pages: true });
  });

  it("picks another name when the first is taken", async () => {
    const calls = github({ create: [422, 201] });
    const r = await publishApp("tok", "todo", "A todo app", files);
    expect(calls.filter((c) => c.path === "/user/repos").map((c) => c.body.name)).toEqual(["todo", "todo-2"]);
    expect(r.repoUrl).toBe("https://github.com/me/todo-2");
  });

  it("says so when Pages could not be turned on, instead of giving a dead link", async () => {
    github({ pages: 403 });
    const r = await publishApp("tok", "todo", "A todo app", files);
    expect(r.pages).toBe(false);
    expect(r.pagesError).toMatch(/403/);
  });
});
