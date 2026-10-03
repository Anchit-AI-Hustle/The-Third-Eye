import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { FeatureHistory } from "@/components/studio/FeatureHistory";
import { featureHistory, featureOf, recordGeneration, type GenerationRecord } from "@/lib/generations";

const rec = (r: Partial<GenerationRecord> & Pick<GenerationRecord, "app" | "appLabel" | "title">) =>
  recordGeneration({ kind: "markdown", inputs: [], output: "x", ...r });

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe("each feature's own history", () => {
  it("files a record under the feature that made it, including records made before tools were tagged", () => {
    rec({ app: "studio", appLabel: "Studio · Cold Outreach", title: "old outreach" });
    rec({ app: "studio", appLabel: "Studio · Meeting Studio", tool: "meeting", title: "minutes" });
    rec({ app: "video", appLabel: "Reel Studio · Clip", tool: "reel", title: "reel clip" });
    rec({ app: "video", appLabel: "Video Studio · Clip", title: "old clip" });
    rec({ app: "music", appLabel: "Music Studio", title: "track" });
    expect(featureHistory("outreach").map((g) => g.title)).toEqual(["old outreach"]);
    expect(featureHistory("meeting").map((g) => g.title)).toEqual(["minutes"]);
    expect(featureHistory("reel").map((g) => g.title)).toEqual(["reel clip"]);
    expect(featureHistory("video").map((g) => g.title)).toEqual(["old clip"]);
    expect(featureOf(featureHistory("music")[0])).toBe("music");
  });

  it("lists only this feature's records, newest first, and updates as new ones are made", () => {
    rec({ app: "studio", appLabel: "Studio · How-To Guide", tool: "how-to", title: "how to swim" });
    rec({ app: "studio", appLabel: "Studio · Cold Outreach", tool: "outreach", title: "outreach" });
    render(<FeatureHistory tool="how-to" accent="#34D399" />);
    expect(screen.getByText("how to swim").closest("a")?.getAttribute("href")).toMatch(/^\/generations\/gen_/);
    expect(screen.queryByText("outreach")).toBeNull();
    act(() => { rec({ app: "studio", appLabel: "Studio · How-To Guide", tool: "how-to", title: "how to cycle" }); });
    expect(screen.getAllByRole("link").map((a) => a.textContent)).toEqual([expect.stringContaining("how to cycle"), expect.stringContaining("how to swim")]);
  });
});
