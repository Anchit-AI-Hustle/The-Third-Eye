import { afterEach, describe, expect, it, vi } from "vitest";
import { authorizeUrl, describeResults, postEverywhere, PROVIDERS, providerConfig } from "@/lib/social";

afterEach(() => vi.unstubAllEnvs());

describe("social accounts", () => {
  it("offers a platform only once its app keys are set", () => {
    expect(providerConfig("x")).toBeNull();
    vi.stubEnv("X_CLIENT_ID", "id");
    vi.stubEnv("X_CLIENT_SECRET", "secret");
    expect(providerConfig("x")).toEqual({ id: "id", secret: "secret" });
  });

  it("signs in to X with PKCE and the posting scope", () => {
    vi.stubEnv("X_CLIENT_ID", "id");
    vi.stubEnv("X_CLIENT_SECRET", "secret");
    const { url, verifier } = authorizeUrl("x", "https://app/cb", "s1");
    const u = new URL(url);
    expect(u.searchParams.get("code_challenge_method")).toBe("S256");
    expect(u.searchParams.get("scope")).toContain("tweet.write");
    expect(u.searchParams.get("state")).toBe("s1");
    expect(verifier).toBeTruthy();
  });

  it("says where it didn't post instead of claiming it did", async () => {
    const r = await postEverywhere("u@x.com", ["linkedin"], { text: "hi" });
    expect(r).toEqual([{ platform: "linkedin", account: "", ok: false, error: expect.stringContaining("isn't connected") }]);
    expect(describeResults(r)).toContain("Not posted on LinkedIn");
  });

  it("refuses an Instagram post without an image", async () => {
    await expect(PROVIDERS.instagram.post({ platform: "instagram", accountId: "1", name: "@me", token: "t" }, { text: "hi" })).rejects.toThrow(/need an image/);
  });
});
