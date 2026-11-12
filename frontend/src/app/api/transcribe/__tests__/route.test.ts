// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("next-auth", () => ({ getServerSession: async () => null }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/gatewayAuth", () => ({
  bearerFrom: (h: Headers) => h.get("authorization")?.slice(7) ?? null,
  emailForToken: async (t: string, scope: string) => (t === "te_gw_ok" && scope === "transcribe" ? "u@x.com" : null),
}));
vi.mock("@/lib/llmCascade", () => ({ isHallucination: () => false, transcribeCascade: async () => ({ text: "hello", provider: "groq" }) }));
vi.mock("@/lib/providerReady", () => ({ usableGeminiKey: () => "k" }));

import { POST } from "@/app/api/transcribe/route";

const req = (auth?: string) => {
  const fd = new FormData();
  fd.append("audio", new Blob([new Uint8Array(1000)], { type: "audio/wav" }), "a.wav");
  return new Request("http://x/api/transcribe", { method: "POST", body: fd, headers: auth ? { authorization: `Bearer ${auth}` } : {} });
};

describe("POST /api/transcribe", () => {
  it("serves the computer listener's token and refuses without one", async () => {
    expect((await POST(req("te_gw_ok") as never)).status).toBe(200);
    expect((await POST(req() as never)).status).toBe(401);
    expect((await POST(req("te_gw_bad") as never)).status).toBe(401);
  });
});
