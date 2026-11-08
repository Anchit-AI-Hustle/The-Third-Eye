import { afterEach, describe, expect, it, vi } from "vitest";
import { isPhone, routeToPhone } from "@/lib/handoff";

const wa = { type: "open_url", data: { url: "https://wa.me/919800000000?text=hi", nativeUrl: "whatsapp://send?phone=919800000000&text=hi", action: "whatsapp", label: "Open WhatsApp", to: "Priya", message: "hi" } };
const web = { type: "open_url", data: { url: "https://example.com" } };

afterEach(() => vi.unstubAllGlobals());

describe("handoff", () => {
  it("tells phones from computers", () => {
    expect(isPhone("Mozilla/5.0 (Linux; Android 14; Pixel 8)")).toBe(true);
    expect(isPhone("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)")).toBe(true);
    expect(isPhone("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe(false);
  });

  it("on a computer, sends WhatsApp to the phone and keeps everything else here", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ queued: true })));
    vi.stubGlobal("fetch", fetchMock);
    const r = await routeToPhone([wa, web]);
    expect(r.effects).toEqual([web]);
    expect(r.note).toContain("Sent to your phone");
    expect(JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)).toMatchObject({ action: "whatsapp", label: "WhatsApp Priya", detail: '"hi"' });
  });

  it("opens it here when no phone took it", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ queued: false }))));
    const r = await routeToPhone([wa]);
    expect(r.effects).toEqual([wa]);
    expect(r.note).toBe("");
  });
});
