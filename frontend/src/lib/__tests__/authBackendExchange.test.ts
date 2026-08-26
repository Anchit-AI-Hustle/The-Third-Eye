import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * The sign-in JWT callback exchanges Google's ID token for a backend session
 * token — but only when a backend actually exists.
 *
 * BACKEND_URL used to default to `http://backend:8000`, a docker-compose
 * service name that resolves only inside that network. On a hosted frontend it
 * resolves nowhere, so every sign-in fired a request that could only fail and
 * paid the connection failure before completing. These tests pin that an unset
 * BACKEND_URL means "no backend" rather than "guess a hostname".
 *
 * authOptions reads the env var at module load, so each test re-imports the
 * module with the environment it wants.
 */

const OLD_ENV = process.env;

beforeEach(() => {
  process.env = { ...OLD_ENV };
  vi.resetModules();
  vi.restoreAllMocks();
});

afterEach(() => {
  process.env = OLD_ENV;
});

async function runJwtCallback(): Promise<{ token: any; fetchMock: ReturnType<typeof vi.fn> }> {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ access_token: "backend-token" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );
  vi.stubGlobal("fetch", fetchMock);

  const { authOptions } = await import("@/lib/auth");
  const jwt = authOptions.callbacks!.jwt!;
  const token = await jwt({
    token: {},
    account: {
      provider: "google",
      type: "oauth",
      providerAccountId: "1",
      id_token: "google-id-token",
      access_token: "at",
      expires_at: Math.floor(Date.now() / 1000) + 3600,
    },
    profile: { email: "user@example.com" },
  } as any);

  return { token: token as any, fetchMock };
}

/** Only the calls aimed at the backend session endpoint. */
function sessionCalls(fetchMock: ReturnType<typeof vi.fn>): string[] {
  return fetchMock.mock.calls
    .map((c) => String(c[0]))
    .filter((url) => url.includes("/api/v1/auth/session"));
}

describe("backend session exchange", () => {
  it("is skipped entirely when BACKEND_URL is unset", async () => {
    delete process.env.BACKEND_URL;
    const { token, fetchMock } = await runJwtCallback();

    expect(sessionCalls(fetchMock)).toEqual([]);
    expect(token.backendToken).toBeUndefined();
    // Sign-in itself must still succeed — the backend is optional.
    expect(token.accessToken).toBe("at");
  });

  it("does not fall back to the docker-compose hostname", async () => {
    delete process.env.BACKEND_URL;
    const { fetchMock } = await runJwtCallback();
    const attempted = fetchMock.mock.calls.map((c) => String(c[0])).join(" ");
    expect(attempted).not.toContain("backend:8000");
  });

  it("treats a whitespace-only value as unset", async () => {
    process.env.BACKEND_URL = "   ";
    const { fetchMock } = await runJwtCallback();
    expect(sessionCalls(fetchMock)).toEqual([]);
  });

  it("exchanges the Google ID token when a backend is configured", async () => {
    process.env.BACKEND_URL = "https://api.example.com";
    const { token, fetchMock } = await runJwtCallback();

    const calls = sessionCalls(fetchMock);
    expect(calls).toEqual(["https://api.example.com/api/v1/auth/session"]);
    expect(token.backendToken).toBe("backend-token");

    const init = fetchMock.mock.calls.find((c) =>
      String(c[0]).includes("/api/v1/auth/session"),
    )![1] as RequestInit;
    // The backend verifies this as a Google ID token, so it must be the one
    // Google issued — not our own session token.
    expect(JSON.parse(String(init.body))).toEqual({ token: "google-id-token" });
  });

  it("keeps sign-in working when a configured backend rejects the token", async () => {
    process.env.BACKEND_URL = "https://api.example.com";
    const fetchMock = vi.fn().mockResolvedValue(new Response("nope", { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});

    const { authOptions } = await import("@/lib/auth");
    const token = (await authOptions.callbacks!.jwt!({
      token: {},
      account: { provider: "google", type: "oauth", providerAccountId: "1", id_token: "t" },
      profile: { email: "user@example.com" },
    } as any)) as any;

    expect(token.backendToken).toBeUndefined();
    // A rejection is reported rather than swallowed — that silence is what hid
    // the HS256/RS256 mismatch for so long.
    expect(errors).toHaveBeenCalled();
    expect(String(errors.mock.calls[0][0])).toContain("401");
  });
});
