import { afterEach, describe, expect, it, vi } from "vitest";
import { isAuthorized } from "@/lib/automation/auth";

const req = (headers: Record<string, string> = {}) => new Request("https://x.test/api/cron/social-post", { headers }) as never;
afterEach(() => vi.unstubAllEnvs());

describe("automation gate", () => {
  it("in production, is closed when CRON_SECRET is missing", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CRON_SECRET", "");
    expect(isAuthorized(req())).toBe(false);
  });

  it("takes only the bearer secret", () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    expect(isAuthorized(req({ authorization: "Bearer s3cret" }))).toBe(true);
    expect(isAuthorized(req({ authorization: "Bearer s3cre" }))).toBe(false);
    expect(isAuthorized(req({ "x-cron-secret": "s3cret" }))).toBe(false);
  });
});
