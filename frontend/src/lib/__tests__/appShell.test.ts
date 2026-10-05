import { describe, expect, it } from "vitest";
import { mainClassFor, showsAppShell } from "@/lib/appShell";

describe("app shell", () => {
  it("keeps the sidebar on every app page", () => {
    for (const path of [
      "/dashboard",
      "/agents",
      "/generations",
      "/generations/abc",
      "/plans",
      "/upgrade",
      "/capabilities",
      "/audit",
      "/tools/music",
      "/settings",
      "/assistant",
    ]) {
      expect(showsAppShell(path)).toBe(true);
    }
  });

  it("leaves public pages without the app menu", () => {
    for (const path of [
      "/",
      "/auth/signin",
      "/auth/error",
      "/calculators",
      "/calculators/emi",
      "/privacy_policy",
      "/terms_of_service",
      "/kolab-store/anchit",
    ]) {
      expect(showsAppShell(path)).toBe(false);
    }
  });

  it("gives the assistant a fixed pane and every other page the scrolling pane", () => {
    expect(mainClassFor("/assistant")).toContain("overflow-hidden");
    expect(mainClassFor("/dashboard")).toBeUndefined();
  });
});
