import { describe, expect, it, vi } from "vitest";

vi.mock("next-auth", () => ({ getServerSession: async () => ({ user: { email: "u@x.test" } }) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
const saved: unknown[] = [];
vi.mock("@/lib/db", () => ({ getDb: () => ({ from: () => ({ upsert: async (r: unknown) => { saved.push(r); return { error: null }; } }) }) }));

const { POST } = await import("@/app/api/push/subscribe/route");
const subscribe = (endpoint: string) => POST(new Request("https://x.test", { method: "POST", body: JSON.stringify({ endpoint, keys: { p256dh: "p", auth: "a" } }) }) as never);

describe("push subscribe", () => {
  it("keeps only a browser push service as the endpoint the server will POST to", async () => {
    expect((await subscribe("https://fcm.googleapis.com/fcm/send/abc")).status).toBe(200);
    expect((await subscribe("https://web.push.apple.com/abc")).status).toBe(200);
    for (const bad of ["http://fcm.googleapis.com/x", "https://169.254.169.254/latest", "https://evil.example/fcm.googleapis.com", "https://fcm.googleapis.com.evil.example/x"]) {
      expect((await subscribe(bad)).status, bad).toBe(400);
    }
    expect(saved).toHaveLength(2);
  });
});
