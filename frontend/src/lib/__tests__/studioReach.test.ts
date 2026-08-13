import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

import { STUDIO_TOOLS, getTool } from "@/lib/studioTools";

// The assistant's create_asset tool used to hand-list the kinds it accepted.
// That list drifted to 18 of 28, so ten Studio tools could be opened from the
// app hub but never actually run by asking for them. These tests fail if the
// enum is ever pinned to a literal list again.

const routeSource = readFileSync(
  path.resolve(__dirname, "../../app/api/chat/route.ts"),
  "utf8",
);

describe("everything Studio can build, the assistant can ask for", () => {
  it("derives create_asset's kinds from the registry instead of a literal list", () => {
    expect(routeSource).toContain("enum: STUDIO_TOOLS.map((t) => t.id)");
  });

  it("resolves every advertised kind back to a real tool", () => {
    const unresolvable = STUDIO_TOOLS.filter((t) => !getTool(t.id));
    expect(unresolvable.map((t) => t.id)).toEqual([]);
  });

  it("covers the ten that were unreachable", () => {
    // Named explicitly: these are the ones the drift actually cost.
    const ids = STUDIO_TOOLS.map((t) => t.id);
    for (const kind of ["avatar", "budget", "health", "how-to", "journal", "music", "social-media", "study", "travel", "video"]) {
      expect(ids).toContain(kind);
    }
  });

  it("gives every tool a label the model can match a request against", () => {
    const unlabelled = STUDIO_TOOLS.filter((t) => !t.label?.trim());
    expect(unlabelled.map((t) => t.id)).toEqual([]);
  });

  it("has no duplicate ids, which would make one tool unreachable", () => {
    const ids = STUDIO_TOOLS.map((t) => t.id);
    expect(ids.length).toBe(new Set(ids).size);
  });
});
