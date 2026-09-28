import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * Sign-in must ask for identity only.
 *
 * THE BUG THIS PINS
 *   Sign-in requested SIGNIN_SCOPES — identity plus Gmail, Calendar and Chat —
 *   so that logging in also connected Google in one consent screen. But
 *   gmail.readonly and gmail.send are *restricted* scopes, and requesting them
 *   AT SIGN-IN turns Google's verification review into a gate on logging in at
 *   all: while the consent screen is unverified, only accounts on the test-user
 *   list get in and everyone else is refused with AccessDenied.
 *
 *   So the app worked for its author, who is a test user, and refused every
 *   other person who tried it. Nothing in the code looked broken, because
 *   nothing in the code was — the refusal happens at Google.
 *
 *   docs/GOOGLE_OAUTH.md documents identity-only as the rollback. This test is
 *   what stops the convenience of the one-screen flow being restored by
 *   accident before verification clears, because doing so locks everyone out
 *   again and the symptom appears nowhere near the change.
 *
 * WHEN VERIFICATION CLEARS
 *   Put SIGNIN_SCOPES back in lib/auth.ts and delete this file. That is a
 *   deliberate decision with a review behind it, not a refactor.
 */

const OLD_ENV = process.env;

beforeEach(() => {
  process.env = { ...OLD_ENV, GOOGLE_CLIENT_ID: "cid", GOOGLE_CLIENT_SECRET: "secret" };
  vi.resetModules();
});
afterEach(() => {
  process.env = OLD_ENV;
});

async function signinScope(): Promise<string> {
  const { authOptions } = await import("@/lib/auth");
  const google = authOptions.providers[0] as unknown as {
    authorization: { params: { scope: string } };
  };
  return google.authorization.params.scope;
}

describe("sign-in scopes", () => {
  it("asks for identity only", async () => {
    expect((await signinScope()).split(/\s+/).sort()).toEqual(["email", "openid", "profile"]);
  });

  it("requests no restricted scope, which is what gates login on review", async () => {
    const scope = await signinScope();
    for (const restricted of [
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/gmail.send",
    ]) {
      expect(scope).not.toContain(restricted);
    }
  });

  it("asks for no feature scope at all at sign-in", async () => {
    const { INGESTION_SCOPE_LIST } = await import("@/lib/googleToken");
    const scope = await signinScope();
    for (const s of INGESTION_SCOPE_LIST) expect(scope).not.toContain(s);
  });

  it("still has a route that can request the feature scopes later", async () => {
    // Identity-only sign-in is only acceptable because Gmail and Calendar stay
    // reachable through an opt-in connect flow. If that route stopped asking
    // for them, this change would have removed the features rather than
    // deferred them.
    const { INGESTION_SCOPES } = await import("@/lib/googleToken");
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    // Resolved from the vitest root rather than import.meta.url: under the
    // transform that is not a file: URL, and readFileSync refuses it.
    const route = readFileSync(
      join(process.cwd(), "src/app/api/connect/google/route.ts"),
      "utf8",
    );
    expect(route).toContain("INGESTION_SCOPES");
    expect(INGESTION_SCOPES).toContain("gmail.readonly");
  });
});
