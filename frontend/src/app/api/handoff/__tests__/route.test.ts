import { describe, expect, it, vi } from "vitest";

vi.mock("next-auth", () => ({ getServerSession: async () => ({ user: { email: "u@x.com" } }) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/push", () => ({ sendPush: vi.fn(async () => true) }));

import { POST } from "@/app/api/handoff/route";

const post = (b: unknown) => POST(new Request("https://x.test", { method: "POST", body: JSON.stringify(b) }));

describe("handoff route", () => {
  it("refuses anything but a WhatsApp, SMS or call link", async () => {
    expect((await post({ action: "whatsapp", url: "javascript:alert(1)" })).status).toBe(400);
    expect((await post({ action: "pay", url: "https://wa.me/1" })).status).toBe(400);
  });

  it("queues nothing without a database, so the computer opens it itself", async () => {
    expect(await (await post({ action: "whatsapp", url: "https://wa.me/919800000000?text=hi" })).json()).toEqual({ queued: false });
  });
});
