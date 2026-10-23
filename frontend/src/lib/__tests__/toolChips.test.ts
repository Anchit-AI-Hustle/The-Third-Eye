import { describe, expect, it } from "vitest";
import { groupToolLabels } from "@/lib/toolChips";

describe("groupToolLabels", () => {
  it("collapses repeats of the same tool into one chip with a count", () => {
    expect(groupToolLabels(Array(22).fill("github"))).toEqual([{ label: "github", count: 22 }]);
  });

  it("keeps different tools apart, in the order they first ran", () => {
    expect(groupToolLabels(["github", "web search", "github", "github"])).toEqual([
      { label: "github", count: 3 },
      { label: "web search", count: 1 },
    ]);
  });
});
