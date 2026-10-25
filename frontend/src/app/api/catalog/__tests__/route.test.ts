import { beforeEach, describe, expect, it, vi } from "vitest";

let email: string | null = "u@x.com";
vi.mock("next-auth", () => ({ getServerSession: async () => (email ? { user: { email } } : null) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

import { GET } from "@/app/api/catalog/route";
import { STUDIO_TOOLS } from "@/lib/studioTools";
import { APPS } from "@/lib/apps/registry";
import { CAPS } from "@/lib/capabilities";
import { AUDITS } from "@/lib/audits";
import { SYSTEMS } from "@/lib/systems";
import { EVENT_PLATFORMS } from "@/lib/health/events";
import { priceFor } from "@/lib/billing/plans";

beforeEach(() => { email = "u@x.com"; });

describe("catalog API for the native apps", () => {
  it("needs a signed-in user", async () => {
    email = null;
    expect((await GET()).status).toBe(401);
  });

  it("carries every list the native screens draw, as plain JSON", async () => {
    const body = await (await GET()).json();
    expect(body.studioTools).toHaveLength(STUDIO_TOOLS.length);
    expect(body.studioTools.find((t: { id: string }) => t.id === "travel")).toMatchObject({ category: "Life & Plans", format: "markdown", fields: expect.any(Array) });
    expect(body.apps).toHaveLength(APPS.length);
    expect(body.capabilities).toHaveLength(CAPS.length);
    expect(body.capabilities.every((c: Record<string, unknown>) => !("icon" in c))).toBe(true);
    expect(body.audits).toHaveLength(AUDITS.length);
    expect(body.systems).toHaveLength(SYSTEMS.length);
    expect(body.health.platforms).toHaveLength(EVENT_PLATFORMS.length);
    expect(body.health.activities.yoga).toBe("Yoga");
    expect(body.systems[0].lines.every((l: unknown) => typeof l === "string")).toBe(true);
    expect(body.systems[0]).toMatchObject({ id: "jarvis", lang: "en-GB", gender: "male" });
    expect(body.plans.tiers.map((t: { id: string }) => t.id)).toEqual(["basic", "plus", "pro", "max"]);
    expect(body.plans.tiers[1].prices.monthly).toBe(priceFor("plus", "monthly"));
    expect(body.plans.levels[0]).toEqual({ min: 0, name: "Newcomer", avatar: "🌱" });
  });
});
