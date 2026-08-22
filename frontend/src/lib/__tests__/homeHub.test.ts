import { describe, expect, it } from "vitest";
import { applyHomeAction, DEFAULT_HUB, matchHubDevices } from "@/lib/homeHub";

describe("JARVIS Home Hub", () => {
  it("matches living room lights by room + kind", () => {
    const hits = matchHubDevices(DEFAULT_HUB, "living room lights");
    expect(hits.every((d) => d.kind === "light" && d.room === "Living room")).toBe(true);
    expect(hits.length).toBeGreaterThan(0);
  });

  it("turns all lights on", () => {
    const { changed, summary } = applyHomeAction(DEFAULT_HUB, "on", "all lights");
    expect(changed.length).toBeGreaterThan(1);
    expect(changed.every((d) => d.kind === "light" && d.on)).toBe(true);
    expect(summary).toMatch(/Home Hub/i);
  });

  it("unlocks the front door", () => {
    const { changed } = applyHomeAction(DEFAULT_HUB, "unlock", "front door");
    expect(changed).toHaveLength(1);
    expect(changed[0].locked).toBe(false);
  });

  it("sets thermostat temperature", () => {
    const { changed } = applyHomeAction(DEFAULT_HUB, "set", "thermostat", "24");
    expect(changed[0].kind).toBe("thermostat");
    expect(changed[0].level).toBe(24);
    expect(changed[0].on).toBe(true);
  });

  it("reports unknown devices instead of inventing success", () => {
    const { changed, summary } = applyHomeAction(DEFAULT_HUB, "on", "pool heater");
    expect(changed).toHaveLength(0);
    expect(summary).toMatch(/No Home Hub device/i);
  });
});
