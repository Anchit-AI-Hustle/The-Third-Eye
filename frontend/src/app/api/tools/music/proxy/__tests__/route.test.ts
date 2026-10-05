import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next-auth", () => ({ getServerSession: () => Promise.resolve({ user: { email: "+919999999999" } }) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

const get = async (url: string, extra = "") => {
  const { GET } = await import("@/app/api/tools/music/proxy/route");
  return GET(new Request(`https://x.test/api/tools/music/proxy?url=${encodeURIComponent(url)}${extra}`) as never);
};

const RELEASE = "https://github.com/Anchit-AI-Hustle/anchor-autopilot/releases/download/drop-2026-09-04/a.mp3";

afterEach(() => { vi.unstubAllGlobals(); });

describe("/api/tools/music/proxy", () => {
  it("follows an ANCHOR release download to GitHub's asset host", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: "https://release-assets.githubusercontent.com/x/a.mp3?sig=1" } }))
      .mockResolvedValueOnce(new Response("ID3", { headers: { "content-type": "audio/mpeg" } }));
    vi.stubGlobal("fetch", fetchMock);
    const res = await get(RELEASE);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("ID3");
    expect(fetchMock.mock.calls[1][0]).toBe("https://release-assets.githubusercontent.com/x/a.mp3?sig=1");
  });

  it("sends a download as an attachment named for the file, and leaves playback inline", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("ID3", { headers: { "content-type": "audio/mpeg" } })));
    const dl = await get("https://replicate.delivery/x/out", "&dl=1&name=hard%20techno");
    expect(dl.headers.get("content-disposition")).toBe('attachment; filename="hard-techno.mp3"');
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("ftyp", { headers: { "content-type": "video/mp4" } })));
    const vid = await get("https://replicate.delivery/xezq/abc/output_2026", "&dl=1&name=clip");
    expect(vid.headers.get("content-disposition")).toBe('attachment; filename="clip.mp4"');
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("ID3", { headers: { "content-type": "audio/mpeg" } })));
    const play = await get("https://replicate.delivery/x/out");
    expect(play.headers.get("content-disposition")).toBeNull();
  });

  it("refuses other github.com paths and redirects anywhere else", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 302, headers: { location: "https://evil.example/a.mp3" } }));
    vi.stubGlobal("fetch", fetchMock);
    expect((await get("https://github.com/someone/else/releases/download/v1/a.mp3")).status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
    expect((await get(RELEASE)).status).toBe(502);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
