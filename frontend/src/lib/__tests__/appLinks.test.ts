import { describe, expect, it } from "vitest";

import { isInternalLink, resolveAppLink } from "@/lib/appLinks";
import { APPS as REGISTRY } from "@/lib/apps/registry";

describe("the user's own apps", () => {
  it.each([
    ["my tasks", "/tasks"],
    ["tasks", "/tasks"],
    ["notes", "/notes"],
    ["goals", "/goals"],
    ["knowledge", "/knowledge"],
    ["job agent", "/job-agent"],
    ["kolab", "/kolab"],
    ["finance", "/finance"],
    ["music studio", "/tools/music"],
    ["trip planner", "/tools/travel"],
    ["okr planner", "/tools/okr"],
    ["budget planner", "/tools/budget"],
  ])("resolves %s to %s", (spoken, route) => {
    expect(resolveAppLink(spoken).url).toBe(route);
  });

  it("accepts the hyphenated id as well as the spoken label", () => {
    expect(resolveAppLink("job-agent").url).toBe("/job-agent");
  });

  it("reaches every internal app in the registry by its label", () => {
    const internal = REGISTRY.filter((a) => a.kind === "internal");
    const unreachable = internal.filter((a) => resolveAppLink(a.label).url !== a.href);
    expect(unreachable.map((a) => a.label)).toEqual([]);
  });

  it("never sends an internal app to a web search", () => {
    const internal = REGISTRY.filter((a) => a.kind === "internal");
    const escaped = internal.filter((a) => resolveAppLink(a.label).url.startsWith("http"));
    expect(escaped.map((a) => a.label)).toEqual([]);
  });
});

describe("alias matching is whole-word", () => {
  // Each of these was a real misroute: the alias sat inside the app's name.
  it("does not send Kolab to a cab service", () => {
    expect(resolveAppLink("kolab").url).not.toContain("olacabs");
  });

  it("does not send the Music Studio to a rival generator", () => {
    expect(resolveAppLink("music studio").url).not.toContain("udio.com");
  });

  it("does not send the Studio to a rival generator", () => {
    expect(resolveAppLink("studio").url).not.toContain("udio.com");
  });

  it("still resolves the services those aliases belong to", () => {
    expect(resolveAppLink("ola").url).toContain("olacabs");
    expect(resolveAppLink("udio").url).toContain("udio.com");
  });

  it("matches an alias used as a word inside a sentence", () => {
    expect(resolveAppLink("open youtube please").url).toContain("youtube.com");
  });

  it("does not match an alias buried inside an unrelated word", () => {
    // "x" is an alias for the site; "xylophone" must not resolve to it.
    expect(resolveAppLink("xylophone").url).toContain("google.com/search");
  });
});

describe("external targets still work", () => {
  it.each([
    ["youtube", "youtube.com"],
    ["spotify", "open.spotify.com"],
    ["gmail", "mail.google.com"],
  ])("resolves %s to %s", (spoken, host) => {
    expect(resolveAppLink(spoken).url).toContain(host);
  });

  it("uses the search URL when a query is supplied", () => {
    const { url } = resolveAppLink("youtube", "lo-fi beats");
    expect(url).toContain("search_query=lo-fi");
  });

  it("passes a full URL through untouched", () => {
    expect(resolveAppLink("https://example.com/path").url).toBe("https://example.com/path");
  });

  it("treats a bare domain as a site", () => {
    expect(resolveAppLink("example.com").url).toBe("https://example.com");
  });

  it("falls back to a web search for something unrecognised", () => {
    expect(resolveAppLink("blorptastic widgets").url).toContain("google.com/search");
  });
});

describe("isInternalLink", () => {
  it("recognises an in-app route", () => {
    expect(isInternalLink("/tasks")).toBe(true);
  });

  it("rejects an external URL", () => {
    expect(isInternalLink("https://youtube.com")).toBe(false);
  });
});
