import { beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.fn();
vi.mock("@/lib/googleToken", () => ({ GOOGLE_SIGNIN_PARAMS: {}, storeGoogleRefreshToken: (...a: unknown[]) => store(...a) }));

import { authOptions } from "@/lib/auth";

const jwt = authOptions.callbacks!.jwt! as (p: Record<string, unknown>) => Promise<Record<string, unknown>>;
const signIn = () => jwt({ token: { email: "a@b.com" }, account: { refresh_token: "1//refresh-secret", scope: "gmail" }, profile: undefined });

beforeEach(() => { store.mockReset(); vi.restoreAllMocks(); });

describe("auth jwt callback when saving the Google token fails", () => {
  it("still signs the user in", async () => {
    store.mockRejectedValue(new Error("connection refused"));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(signIn()).resolves.toMatchObject({ email: "a@b.com" });
  });

  it("logs a clear warning with the reason, never the token or the address", async () => {
    store.mockRejectedValue(new Error("connection refused"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await signIn();
    expect(warn).toHaveBeenCalledTimes(1);
    const line = warn.mock.calls[0].join(" ");
    expect(line).toMatch(/Google refresh token.*not saved.*connection refused/i);
    expect(line).not.toMatch(/refresh-secret|a@b\.com/);
  });

  it("stays quiet when saving works", async () => {
    store.mockResolvedValue(undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await signIn();
    expect(warn).not.toHaveBeenCalled();
  });
});
