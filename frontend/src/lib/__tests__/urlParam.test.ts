import { describe, expect, it } from "vitest";
import { takeUrlParam } from "@/lib/urlParam";

describe("takeUrlParam", () => {
  it("returns a query value once and removes it from the address bar", () => {
    window.history.replaceState(null, "", "/assistant?ask=Give%20me%20my%20morning%20briefing&x=1");
    expect(takeUrlParam("ask")).toBe("Give me my morning briefing");
    expect(window.location.pathname + window.location.search).toBe("/assistant?x=1");
    expect(takeUrlParam("ask")).toBeNull();
  });
});
