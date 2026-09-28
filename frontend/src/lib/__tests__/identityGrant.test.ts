import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * An identity-only Google grant is not a connection.
 *
 * THE TWO DEFECTS THIS PINS
 *   Sign-in was rolled back to identity-only scopes because the Gmail scopes are
 *   restricted and asking for them on the login screen gated login on Google's
 *   verification review. Two places had been written on the assumption that
 *   sign-in grants everything, and neither was updated:
 *
 *   1. lib/auth.ts stored the refresh token from sign-in in google_tokens. That
 *      table holds ONE row per user, upserted on user_id, and it is the row the
 *      Gmail/Chat crons read. A user who connected Google through
 *      /api/connect/google and then signed in again had their working grant
 *      overwritten with one that can mint nothing but identity - Gmail stops,
 *      and the row looks fine because updated_at is fresh.
 *
 *   2. /api/connect/google/status reported `connected: !!row`. Since sign-in
 *      created a row for everyone, Settings told every signed-in user "Connected"
 *      above a list of zero permissions.
 *
 *   Both are invisible from the code: nothing throws, and the owner - who had
 *   connected Google before the rollback and is a Google test user - would see a
 *   working app either way.
 */

const USER = "user@example.com";

const upsert = vi.fn().mockResolvedValue({ error: null });
let row: { scope?: string; updated_at?: string } | null = null;

vi.mock("@/lib/serverSupabase", () => ({
  getAdminSupabase: () => ({
    from: () => ({
      upsert: (...a: unknown[]) => upsert(...a),
      select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: row }) }) }),
    }),
  }),
}));
vi.mock("@/lib/crypto", () => ({ encrypt: (v: string) => `enc(${v})`, decrypt: (v: string) => v }));
vi.mock("next-auth", () => ({
  getServerSession: () => Promise.resolve({ user: { email: USER } }),
}));

const OLD_ENV = process.env;
beforeEach(() => {
  process.env = { ...OLD_ENV, GOOGLE_CLIENT_ID: "cid", GOOGLE_CLIENT_SECRET: "secret", BACKEND_URL: "" };
  vi.resetModules();
  upsert.mockClear();
  row = null;
});
afterEach(() => {
  process.env = OLD_ENV;
});

/** Drive the real jwt callback the way NextAuth does on a fresh sign-in. */
async function signIn(scope: string) {
  const { authOptions } = await import("@/lib/auth");
  const jwt = authOptions.callbacks!.jwt!;
  return jwt({
    token: {},
    account: { refresh_token: "1//rt", scope, expires_at: 0, provider: "google", type: "oauth", providerAccountId: "1" },
    profile: { email: USER },
  } as never);
}

const IDENTITY = "openid email profile";
const WITH_GMAIL = "openid email profile https://www.googleapis.com/auth/gmail.readonly";

describe("what gets written to google_tokens at sign-in", () => {
  it("does not store an identity-only refresh token", async () => {
    await signIn(IDENTITY);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("cannot overwrite a feature-scoped grant, which is the data loss", async () => {
    // The row the connect flow wrote. Signing in again must leave it alone.
    row = { scope: WITH_GMAIL };
    await signIn(IDENTITY);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("still stores a grant that carries a feature scope", async () => {
    await signIn(WITH_GMAIL);
    expect(upsert).toHaveBeenCalledTimes(1);
    const written = upsert.mock.calls[0][0] as { user_id: string; scope: string };
    expect(written.user_id).toBe(USER);
    expect(written.scope).toBe(WITH_GMAIL);
  });

  it("stores nothing when Google returned no refresh token at all", async () => {
    const { authOptions } = await import("@/lib/auth");
    await authOptions.callbacks!.jwt!({
      token: {},
      account: { scope: WITH_GMAIL, provider: "google", type: "oauth", providerAccountId: "1" },
      profile: { email: USER },
    } as never);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("keeps the access token on the session regardless", async () => {
    // Refusing to PERSIST an identity grant must not break signing in with it.
    const token = (await signIn(IDENTITY)) as { refreshToken?: string };
    expect(token.refreshToken).toBe("1//rt");
  });
});

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
