import { afterEach, describe, expect, it, vi } from "vitest";

const getToken = vi.fn();
vi.mock("@/lib/github", () => ({ getGithubAccessToken: (e: string) => getToken(e) }));
vi.mock("@/lib/push", () => ({ sendPush: vi.fn(async () => true) }));
const template = vi.fn(async () => true);
vi.mock("@/lib/whatsapp", () => ({ sendWhatsAppTemplate: (...a: unknown[]) => template(...(a as [])) }));

import { fileFeatureRequest } from "@/lib/featureRequests";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); getToken.mockReset(); template.mockClear(); });

describe("feature requests", () => {
  it("files the write-up on the owner's repo and sends it to the review number, without claiming it is built", async () => {
    vi.stubEnv("OWNER_EMAILS", "Owner@x.com");
    vi.stubEnv("FEATURE_REVIEW_WHATSAPP", "+91 98000 00000");
    getToken.mockResolvedValue({ token: "t" });
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ html_url: "https://github.com/Anchit-AI-Hustle/The-Third-Eye/issues/9" }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    const r = await fileFeatureRequest({ title: "Split bills", goal: "Share costs", spec: "A tool that…", askedBy: "u@x.com" });
    expect(getToken).toHaveBeenCalledWith("owner@x.com");
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body).toMatchObject({ title: "Feature: Split bills", labels: ["jarvis-feature"] });
    expect(template).toHaveBeenCalledWith("919800000000", expect.stringContaining("Split bills"));
    expect(r.ok).toBe(true);
    expect(r.result).toContain("isn't in the app yet");
  });

  it("says nothing was built when the owner's GitHub isn't connected", async () => {
    vi.stubEnv("OWNER_EMAILS", "owner@x.com");
    getToken.mockResolvedValue(null);
    const r = await fileFeatureRequest({ title: "X", goal: "g", spec: "s", askedBy: "owner@x.com" });
    expect(r).toMatchObject({ ok: false });
    expect(r.result).toContain("Nothing was built");
  });
});
