import { describe, expect, it } from "vitest";

import { appInventory } from "@/lib/tools/inventory";
import { APPS } from "@/lib/apps/registry";
import { STUDIO_TOOLS } from "@/lib/studioTools";

// The assistant told a user it had no music studio while /tools/music sat in the
// registry, and asked which website was meant when asked about "this website".
// These assert it is told otherwise.

const inventory = appInventory();

describe("knowing what it is running inside", () => {
  it("names the product", () => {
    expect(inventory).toContain("The Third Eye");
  });

  it("resolves 'this website' rather than asking which one", () => {
    expect(inventory).toMatch(/this website/i);
    expect(inventory).toMatch(/never ask which site/i);
  });
});

describe("knowing its own apps", () => {
  it("lists every internal app with its route", () => {
    const internal = APPS.filter((a) => a.kind === "internal");
    const missing = internal.filter((a) => !inventory.includes(a.href));
    expect(missing.map((a) => a.label)).toEqual([]);
  });

  it("names Music Studio specifically, the one it denied having", () => {
    expect(inventory).toContain("/tools/music");
  });

  it("does not advertise external services as its own", () => {
    // The registry deep-links to Spotify, Swiggy and the like. Those are not
    // features of this OS and must not be listed as though they were.
    expect(inventory).not.toContain("open.spotify.com");
    expect(inventory).not.toContain("swiggy.com");
  });
});

describe("knowing what it can build", () => {
  it("lists every Studio tool by id", () => {
    const missing = STUDIO_TOOLS.filter((t) => !inventory.includes(t.id));
    expect(missing.map((t) => t.id)).toEqual([]);
  });

  it("points at create_asset as the way to run them", () => {
    expect(inventory).toContain("create_asset");
  });
});

describe("staying honest", () => {
  it("still allows denying things that genuinely are not connected", () => {
    // The fix must not turn into "claim everything works".
    expect(inventory).toMatch(/genuinely are not connected|Say so plainly/i);
  });

  it("grows with the registries rather than being hand-maintained", () => {
    // A hand-written list is what drifted in the first place.
    expect(inventory.split("\n").filter((l) => l.startsWith("- ")).length).toBe(
      APPS.filter((a) => a.kind === "internal").length,
    );
  });
});
