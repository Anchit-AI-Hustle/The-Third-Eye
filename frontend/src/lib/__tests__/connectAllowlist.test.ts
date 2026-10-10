import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ getDb: () => null }));
vi.mock("next-auth", () => ({
  getServerSession: () => Promise.resolve({ user: { email: "Owner@Example.com" } }),
}));

const OLD_ENV = process.env;
beforeEach(() => {
  process.env = { ...OLD_ENV, GOOGLE_CLIENT_ID: "cid" };
  vi.resetModules();
});
afterEach(() => {
  process.env = OLD_ENV;
});

async function start() {
  const { GET } = await import("@/app/api/connect/google/route");
  return GET(new Request("https://app.example.com/api/connect/google", { headers: { host: "app.example.com" } }));
}

describe("Connect Google while verification is open", () => {
  it("is open to everyone when no list is set", async () => {
    const res = await start();
    expect(res.headers.get("location")).toMatch(/^https:\/\/accounts\.google\.com\//);
  });

  it("lets a listed account reach the consent screen, case-insensitively", async () => {
    process.env.GOOGLE_CONNECT_USERS = "reviewer@gmail.com, owner@example.com";
    const res = await start();
    expect(res.headers.get("location")).toMatch(/^https:\/\/accounts\.google\.com\//);
  });

  it("keeps everyone else off the unverified scopes", async () => {
    process.env.GOOGLE_CONNECT_USERS = "reviewer@gmail.com";
    const res = await start();
    expect(res.headers.get("location")).toBe("https://app.example.com/settings?connect=google_pending");
  });
});
