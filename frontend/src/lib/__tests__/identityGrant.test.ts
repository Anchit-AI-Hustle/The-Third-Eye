import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * An identity-only Google grant is not a connection.
 *
 * THE DEFECT THIS PINS
 *   /api/connect/google/status reported `connected: !!row`. A row in
 *   google_tokens was created for everyone who signed in, so Settings told every
 *   signed-in user "Connected" above a list of zero permissions. It is invisible
 *   from the code — nothing throws — and the owner, who had connected Google
 *   properly, would see a working app either way.
 *
 *   Being connected means holding a scope that can DO something: read mail, read
 *   the calendar. Identity is not one of those.
 *
 * WHAT USED TO BE HERE TOO
 *   The other half of this suite drove the `jwt` callback, which stored the
 *   sign-in refresh token in that same one-row-per-user table and could
 *   overwrite a feature-scoped grant with an identity-only one. Sign-in is now a
 *   mobile number and a 4-digit PIN and asks Google for nothing, so there is no
 *   sign-in write left to test. The guard that fixed it is quoted in lib/auth.ts
 *   inside the commented-out Google provider, so restoring that provider
 *   restores the fix with it.
 */

const USER = "user@example.com";

let row: { scope?: string; updated_at?: string } | null = null;

const upsert = vi.fn().mockResolvedValue({ error: null });

vi.mock("@/lib/serverSupabase", () => ({
  getAdminSupabase: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: row }) }) }),
      upsert: (...a: unknown[]) => upsert(...a),
    }),
  }),
}));
vi.mock("@/lib/crypto", () => ({ encrypt: (v: string) => `enc(${v})`, decrypt: (v: string) => v }));
vi.mock("next-auth", () => ({
  getServerSession: () => Promise.resolve({ user: { email: USER } }),
}));

const OLD_ENV = process.env;
beforeEach(() => {
  process.env = { ...OLD_ENV, GOOGLE_CLIENT_ID: "cid", GOOGLE_CLIENT_SECRET: "secret" };
  vi.resetModules();
  vi.unstubAllGlobals();
  upsert.mockClear();
  row = null;
});
afterEach(() => {
  process.env = OLD_ENV;
});

const IDENTITY = "openid email profile";
const WITH_GMAIL = "openid email profile https://www.googleapis.com/auth/gmail.readonly";

describe('what Settings is told "connected" means', () => {
  async function status() {
    const { GET } = await import("@/app/api/connect/google/status/route");
    return (await GET()).json();
  }

  it("is not connected on an identity-only row", async () => {
    row = { scope: IDENTITY };
    const body = await status();
    expect(body.connected).toBe(false);
    expect(body.capabilities).toMatchObject({ gmailRead: false, calendarRead: false });
  });

  it("is not connected with no row", async () => {
    row = null;
    expect((await status()).connected).toBe(false);
  });

  it("is connected once a feature scope is actually granted", async () => {
    row = { scope: WITH_GMAIL };
    const body = await status();
    expect(body.connected).toBe(true);
    expect(body.capabilities).toMatchObject({ gmailRead: true, gmailSend: false });
  });

  it("reports partial grants honestly rather than as all-or-nothing", async () => {
    // Someone who unticked Gmail on the connect screen but allowed Calendar.
    row = { scope: "openid email https://www.googleapis.com/auth/calendar.readonly" };
    const body = await status();
    expect(body.connected).toBe(true);
    expect(body.capabilities).toMatchObject({ gmailRead: false, gmailSend: false, calendarRead: true });
  });
});

describe("what the connect callback is allowed to store", () => {
  // #313's fix lived in the sign-in helper and went with it. The connect callback
  // never had it, and this PR made the bad outcome ORDINARY by adding openid/email
  // to CONNECT_SCOPES: "declined Gmail and Calendar" now still comes back holding
  // identity scopes, and writing that row replaced a working grant with a useless
  // one while updated_at looked healthy.
  async function callback(scope: string) {
    vi.doMock("@/lib/googleToken", async () => {
      const real = await vi.importActual<typeof import("@/lib/googleToken")>("@/lib/googleToken");
      return { ...real, originFromRequest: () => "https://example.com" };
    });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ refresh_token: "1//rt", scope }),
      text: () => Promise.resolve(""),
    });
    vi.stubGlobal("fetch", fetchMock);
    const { GET } = await import("@/app/api/connect/google/callback/route");
    const req = new Request("https://example.com/api/connect/google/callback?code=c&state=s", {
      headers: { cookie: "g_connect_state=s" },
    });
    return GET(req);
  }

  it("stores nothing when no feature scope was granted", async () => {
    const res = await callback(IDENTITY);
    expect(res.headers.get("location")).toContain("connect=google_no_scopes");
    expect(upsert).not.toHaveBeenCalled();
  });

  it("stores the grant when a feature scope was granted", async () => {
    const res = await callback(WITH_GMAIL);
    expect(res.headers.get("location")).toContain("connect=google_connected");
    expect(upsert).toHaveBeenCalledTimes(1);
  });
});
