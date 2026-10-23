import { describe, expect, it, vi } from "vitest";

const llm = vi.fn();
vi.mock("@/lib/llmCascade", () => ({ llmCascade: (...a: unknown[]) => llm(...a) }));

import { drawSvg, sanitizeSvg } from "@/lib/svgArt";

const ok = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="#4FC3F7"/></svg>';

describe("sanitizeSvg", () => {
  it("keeps a plain drawing, even inside a code fence", () => {
    expect(sanitizeSvg("Here:\n```svg\n" + ok + "\n```")).toBe(ok);
  });
  it("adds the namespace a browser needs to show it as an image", () => {
    expect(sanitizeSvg('<svg viewBox="0 0 10 10"><rect width="5" height="5"/></svg>')).toContain('xmlns="http://www.w3.org/2000/svg"');
  });
  it.each([
    ['<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'],
    ['<svg xmlns="http://www.w3.org/2000/svg"><rect onclick="x()"/></svg>'],
    ['<svg xmlns="http://www.w3.org/2000/svg"><a href="javascript:x()"><rect/></a></svg>'],
    ['<svg xmlns="http://www.w3.org/2000/svg"><image href="https://evil.test/p.png"/></svg>'],
    ['<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><div/></foreignObject></svg>'],
    ["no drawing here"],
  ])("refuses anything that runs code or loads from elsewhere: %s", (raw) => {
    expect(sanitizeSvg(raw)).toBeNull();
  });
});

describe("drawSvg", () => {
  it("returns an image data URL the chat can show", async () => {
    llm.mockResolvedValueOnce({ text: ok });
    const url = await drawSvg("a blue circle");
    expect(url).toMatch(/^data:image\/svg\+xml;base64,/);
    expect(Buffer.from(url!.split(",")[1], "base64").toString()).toBe(ok);
  });
  it("returns null when the model's answer isn't a safe drawing", async () => {
    llm.mockResolvedValueOnce({ text: "I can't draw that" });
    expect(await drawSvg("x")).toBeNull();
  });
});
