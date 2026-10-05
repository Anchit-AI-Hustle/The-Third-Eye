import { describe, expect, it } from "vitest";
import { firstQueryValue, safeCallbackPath, safeRedirectUrl } from "@/lib/authRedirect";
import { authUsesSecureCookies, sessionCookieName } from "@/lib/authCookies";

describe("safeCallbackPath", () => {
  it("keeps an in-app destination", () => {
    expect(safeCallbackPath("/assistant")).toBe("/assistant");
    expect(safeCallbackPath("/dashboard?tab=1")).toBe("/dashboard?tab=1");
  });

  it("sends the sign-in page and the auth API to the dashboard", () => {
    expect(safeCallbackPath("/auth/signin")).toBe("/dashboard");
    expect(safeCallbackPath("/auth/signin?callbackUrl=/dashboard")).toBe("/dashboard");
    expect(safeCallbackPath("/api/auth/signin?error=OAuthCallback")).toBe("/dashboard");
    expect(safeCallbackPath("https://the-third-eye.anchit-tandon.com/auth/signin")).toBe("/dashboard");
  });

  it("rejects off-site and empty targets", () => {
    expect(safeCallbackPath("")).toBe("/dashboard");
    expect(safeCallbackPath("https://evil.example/steal")).toBe("/dashboard");
    expect(safeCallbackPath("//evil.example")).toBe("/dashboard");
  });
});

describe("firstQueryValue", () => {
  it("unwraps the first search param", () => {
    expect(firstQueryValue("OAuthCallback")).toBe("OAuthCallback");
    expect(firstQueryValue(["Callback", "OAuthCallback"])).toBe("Callback");
    expect(firstQueryValue("  ")).toBeUndefined();
    expect(firstQueryValue(undefined)).toBeUndefined();
  });
});

describe("safeRedirectUrl", () => {
  it("returns an absolute url on this site", () => {
    expect(safeRedirectUrl("/notes", "https://the-third-eye.anchit-tandon.com")).toBe(
      "https://the-third-eye.anchit-tandon.com/notes",
    );
    expect(safeRedirectUrl("https://the-third-eye.anchit-tandon.com/", "https://the-third-eye.anchit-tandon.com")).toBe(
      "https://the-third-eye.anchit-tandon.com/dashboard",
    );
  });
});

describe("session cookie name", () => {
  it("uses the __Secure- prefix only for https", () => {
    expect(sessionCookieName(true)).toBe("__Secure-next-auth.session-token");
    expect(sessionCookieName(false)).toBe("next-auth.session-token");
  });

  it("follows NEXTAUTH_URL, not a stray VERCEL flag", () => {
    const prevUrl = process.env.NEXTAUTH_URL;
    const prevVercel = process.env.VERCEL;
    process.env.NEXTAUTH_URL = "https://the-third-eye.anchit-tandon.com";
    process.env.VERCEL = undefined;
    expect(authUsesSecureCookies()).toBe(true);
    process.env.NEXTAUTH_URL = "http://localhost:3000";
    process.env.VERCEL = "1";
    expect(authUsesSecureCookies()).toBe(false);
    process.env.NEXTAUTH_URL = prevUrl;
    process.env.VERCEL = prevVercel;
  });
});
