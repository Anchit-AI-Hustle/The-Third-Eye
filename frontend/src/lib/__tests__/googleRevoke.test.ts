import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { revokeGoogleAccess } from "@/lib/googleToken";

// Deleting our row is not the same as ending the grant. Until this existed, a
// user who deleted their account still saw The Third Eye under "Third-party
// apps with account access" at Google, holding gmail.readonly and gmail.send.

let row: Record<string, unknown> | null = null;
let supabaseConfigured = true;
let deleteError: { message: string } | null = null;
const deletes: string[] = [];

const sb = {
  from(table: string) {
    return {
      select() {
        return { eq: () => ({ maybeSingle: () => Promise.resolve({ data: row }) }) };
      },
      delete() {
        return {
          eq: () => {
            deletes.push(table);
            return Promise.resolve({ error: deleteError });
          },
        };
      },
    };
  },
};

vi.mock("@/lib/serverSupabase", () => ({
  getAdminSupabase: () => (supabaseConfigured ? sb : null),
}));

vi.mock("@/lib/crypto", () => ({
  decrypt: (v: string) => (v === "corrupt" ? null : v.replace(/^enc:/, "")),
}));

const fetchMock = vi.fn();

beforeEach(() => {
  row = { refresh_token_enc: "enc:1//refresh-token" };
  supabaseConfigured = true;
  deleteError = null;
  deletes.length = 0;
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true, status: 200 });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ending the grant at Google", () => {
  it("posts the refresh token to Google's revoke endpoint", async () => {
    await revokeGoogleAccess("user@example.com");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://oauth2.googleapis.com/revoke");
    expect(init.method).toBe("POST");
    expect(String(init.body)).toContain(encodeURIComponent("1//refresh-token"));
  });

  it("sends the decrypted token, never the stored ciphertext", async () => {
    const body = String(
      (await revokeGoogleAccess("user@example.com"), fetchMock.mock.calls[0][1].body),
    );
    expect(body).not.toContain("enc:");
  });

  it("reports success", async () => {
    expect(await revokeGoogleAccess("user@example.com")).toEqual({
      revoked: true,
      cleared: true,
      hadToken: true,
    });
  });

  it("treats Google's invalid_token as already revoked, not as a failure", async () => {
    // The user removed access from their own Google settings first. That is the
    // end state we wanted; reporting a failure would be misleading.
    fetchMock.mockResolvedValue({ ok: false, status: 400 });
    expect((await revokeGoogleAccess("user@example.com")).revoked).toBe(true);
  });

  it("does not claim revocation when Google rejects the call for another reason", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 503 });
    expect((await revokeGoogleAccess("user@example.com")).revoked).toBe(false);
  });
});

describe("still forgetting the token whatever Google says", () => {
  it("deletes the row when Google is unreachable", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));
    const result = await revokeGoogleAccess("user@example.com");
    expect(result.revoked).toBe(false);
    expect(result.cleared).toBe(true);
    expect(deletes).toContain("google_tokens");
  });

  it("deletes the row when Google errors", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });
    await revokeGoogleAccess("user@example.com");
    expect(deletes).toContain("google_tokens");
  });

  it("reports honestly when the row could not be deleted", async () => {
    deleteError = { message: "permission denied" };
    expect((await revokeGoogleAccess("user@example.com")).cleared).toBe(false);
  });
});

describe("nothing to revoke", () => {
  it("skips the network call when the user never connected Google", async () => {
    row = null;
    const result = await revokeGoogleAccess("user@example.com");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toEqual({ revoked: false, cleared: true, hadToken: false });
  });

  it("still clears an undecryptable row rather than leaving it behind", async () => {
    row = { refresh_token_enc: "corrupt" };
    const result = await revokeGoogleAccess("user@example.com");
    expect(result.hadToken).toBe(false);
    expect(deletes).toContain("google_tokens");
  });

  it("does nothing when there is no database configured", async () => {
    supabaseConfigured = false;
    expect(await revokeGoogleAccess("user@example.com")).toEqual({
      revoked: false,
      cleared: false,
      hadToken: false,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
