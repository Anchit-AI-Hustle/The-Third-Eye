import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Every signed-in section (the routes the middleware guards) must render inside
// MainLayout, or the page opens with no sidebar and no way back to the app.
const APP = join(__dirname, "..");
const sections = [...readFileSync(join(APP, "..", "middleware.ts"), "utf8").matchAll(/"\/([a-z-]+)\/:path\*"/g)].map((m) => m[1]);

describe("signed-in pages keep the app's menu", () => {
  it("finds the guarded sections", () => {
    expect(sections).toEqual(expect.arrayContaining(["dashboard", "generations", "agents", "plans"]));
  });

  it.each(sections)("/%s renders inside MainLayout", (section) => {
    const layout = join(APP, section, "layout.tsx");
    const page = join(APP, section, "page.tsx");
    const source = (existsSync(layout) ? readFileSync(layout, "utf8") : "") + (existsSync(page) ? readFileSync(page, "utf8") : "");
    expect(source).toContain("MainLayout");
  });
});
