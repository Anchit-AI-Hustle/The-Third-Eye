import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getGenerationAnywhere, listAllGenerations, recordGeneration, toRow } from "@/lib/generations";

type Call = { url: string; method: string; body?: unknown };
let calls: Call[] = [];
let server: Record<string, unknown> = {};

beforeEach(() => {
  localStorage.clear();
  calls = [];
  server = {};
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const key = `${method} ${url}`;
    return key in server ? Response.json(server[key]) : new Response(null, { status: 501 });
  }));
});
afterEach(() => vi.unstubAllGlobals());

describe("generations", () => {
  it("saves each new generation to the account too", async () => {
    const id = recordGeneration({ app: "studio", tool: "landing", appLabel: "Studio · Landing Page", title: "Launch page", kind: "html", inputs: [{ label: "Product", value: "TTE" }], output: "<h1>Hi</h1>" });
    await vi.waitFor(() => expect(calls.some((c) => c.method === "POST" && c.url.endsWith("/api/data/generations"))).toBe(true));
    const sent = calls.find((c) => c.method === "POST")!.body as Record<string, unknown>;
    expect(sent).toMatchObject({ id, app: "studio", tool: "landing", app_label: "Studio · Landing Page", kind: "html", output: "<h1>Hi</h1>" });
  });

  it("never sends a browser-only media URL as the output", () => {
    expect(toRow({ id: "g", app: "video", appLabel: "Video", title: "Reel", kind: "video", createdAt: "2026-10-30T00:00:00Z", inputs: [], output: "blob:https://x/1" }).output).toBe("");
  });

  it("lists this device's, the account's and the music library's outputs together, newest first, once each", async () => {
    recordGeneration({ app: "music", appLabel: "Music Studio", title: "Here", kind: "audio", inputs: [], output: "/api/music/a.mp3" });
    server["GET /api/data/generations"] = { rows: [
      { id: "cloud1", app: "studio", tool: "landing", app_label: "Studio · Landing Page", title: "From the phone", kind: "html", input_text: null, created_at: "2099-01-01T00:00:00Z" },
    ] };
    server["GET /api/data/music_tracks"] = { rows: [
      { id: "t1", title: "Phone song", description: "made on Android", audio_url: "/api/music/b.mp3", created_at: "2026-01-01T00:00:00Z" },
      { id: "t2", title: "Here", audio_url: "/api/music/a.mp3", created_at: "2026-01-01T00:00:00Z" },
    ] };
    const all = await listAllGenerations();
    expect(all.map((g) => g.title)).toEqual(["From the phone", "Here", "Phone song"]);
    expect(all[2]).toMatchObject({ id: "music_t1", app: "music", kind: "audio", output: "/api/music/b.mp3" });
  });

  it("opens one made on another device from the account", async () => {
    server["GET /api/data/generations?id=cloud1"] = { rows: [
      { id: "cloud1", app: "studio", app_label: "Studio · Landing Page", title: "From the phone", kind: "html", inputs: [], output: "<p>x</p>", created_at: "2026-10-30T00:00:00Z" },
    ] };
    expect(await getGenerationAnywhere("cloud1")).toMatchObject({ title: "From the phone", output: "<p>x</p>", appLabel: "Studio · Landing Page" });
  });
});
