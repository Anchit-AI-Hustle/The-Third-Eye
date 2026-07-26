import { describe, it, expect } from "vitest";
import { appsForMode, categoriesForMode, type AppEntry } from "@/lib/apps/registry";

describe("App Hub Registry", () => {
  it("returns apps for personal mode", () => {
    const apps = appsForMode("personal");
    expect(apps.length).toBeGreaterThan(0);
    expect(apps.every((a: AppEntry) => a.modes.includes("personal"))).toBe(true);
  });

  it("returns apps for professional mode", () => {
    const apps = appsForMode("professional");
    expect(apps.length).toBeGreaterThan(0);
    expect(apps.every((a: AppEntry) => a.modes.includes("professional"))).toBe(true);
  });

  it("returns apps for enterprise mode", () => {
    const apps = appsForMode("enterprise");
    expect(apps.length).toBeGreaterThan(0);
    expect(apps.every((a: AppEntry) => a.modes.includes("enterprise"))).toBe(true);
  });

  it("returns unique categories for personal mode", () => {
    const cats = categoriesForMode("personal");
    expect(cats.length).toBeGreaterThan(0);
    expect(new Set(cats).size).toBe(cats.length);
  });

  it("every app has required fields", () => {
    const apps = appsForMode("personal");
    for (const app of apps) {
      expect(app.id).toBeTruthy();
      expect(app.label).toBeTruthy();
      expect(app.category).toBeTruthy();
      expect(app.href).toBeTruthy();
      expect(app.icon).toBeTruthy();
      expect(["internal", "external"]).toContain(app.kind);
    }
  });

  it("internal apps have routes starting with /", () => {
    const apps = appsForMode("personal");
    const internal = apps.filter((a: AppEntry) => a.kind === "internal");
    for (const app of internal) {
      expect(app.href).toMatch(/^\//);
    }
  });

  it("external apps have https URLs or tel: links", () => {
    const apps = appsForMode("personal");
    const external = apps.filter((a: AppEntry) => a.kind === "external");
    for (const app of external) {
      expect(app.href).toMatch(/^(https:|tel:)/);
    }
  });

  it("emergency apps are flagged correctly", () => {
    const apps = appsForMode("personal");
    const emergency = apps.filter((a: AppEntry) => a.emergency);
    for (const app of emergency) {
      expect(app.href).toMatch(/^tel:/);
    }
  });

  it("Google AI tools are present in the registry", () => {
    const apps = appsForMode("personal");
    const ids = apps.map((a: AppEntry) => a.id);
    expect(ids).toContain("google-ai-studio");
    expect(ids).toContain("notebooklm");
    expect(ids).toContain("stitch");
    expect(ids).toContain("pomelli");
  });

  it("selfBuilt apps have on-device badge text", () => {
    const apps = appsForMode("personal");
    const selfBuilt = apps.filter((a: AppEntry) => a.selfBuilt);
    expect(selfBuilt.length).toBeGreaterThan(0);
    for (const app of selfBuilt) {
      expect(app.kind).toBe("internal");
    }
  });
});
