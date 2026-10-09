import { readFileSync } from "fs";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { anchorDispatch, anchorRequestFrom, runAnchor, toDrop } from "@/lib/anchor";
import { isSensitive, summarizeAction } from "@/lib/actions";

const SONG = "0b7c1e2a-3f4d-4a5b-8c9d-0e1f2a3b4c5d";

beforeEach(() => {
  process.env.ANCHOR_OPERATORS = "+919999999999, owner@example.com";
  process.env.ANCHOR_GITHUB_TOKEN = "ghp_test";
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.ANCHOR_OPERATORS;
  delete process.env.ANCHOR_GITHUB_TOKEN;
});

describe("anchorDispatch", () => {
  it("maps each action onto its workflow and inputs", () => {
    expect(anchorDispatch({ action: "drop", now: true })).toMatchObject({ workflow: "daily.yml", inputs: { publish_now: "true", dry_run: "false" } });
    expect(anchorDispatch({ action: "drop", dryRun: true })).toMatchObject({ inputs: { dry_run: "true" } });
    expect(anchorDispatch({ action: "queue_song", song: `https://suno.com/song/${SONG}` })).toMatchObject({ workflow: "queue-song.yml", inputs: { song: SONG, release_now: "false" } });
    expect(anchorDispatch({ action: "mix", period: "month" })).toMatchObject({ workflow: "weekly-mix.yml", inputs: { period: "month" } });
  });

  it("refuses a song that isn't a Suno song", () => {
    for (const song of ["", "https://evil.example/song/x", "https://suno.com/playlist/abc"]) {
      expect(anchorDispatch({ action: "queue_song", song })).toHaveProperty("error");
    }
  });
});

describe("anchorRequestFrom", () => {
  it("turns the chat tool's arguments into a request", () => {
    expect(anchorRequestFrom({ action: "rehearse" })).toMatchObject({ action: "drop", dryRun: true });
    expect(anchorRequestFrom({ action: "run_drop", now: true })).toMatchObject({ action: "drop", dryRun: false, now: true });
    expect(anchorRequestFrom({ action: "queue_song", song: SONG })).toMatchObject({ action: "queue_song", song: SONG });
  });
});

describe("runAnchor", () => {
  it("dispatches the workflow on main for an operator", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    const out = await runAnchor("owner@example.com", { action: "drop" });
    expect(out.ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.github.com/repos/Anchit-AI-Hustle/anchor-autopilot/actions/workflows/daily.yml/dispatches");
    expect(JSON.parse(init.body)).toEqual({ ref: "main", inputs: { publish_now: "false", dry_run: "false" } });
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer ghp_test");
  });

  it("refuses anyone who isn't an operator, without calling GitHub", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect((await runAnchor("+918888888888", { action: "drop" })).ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports GitHub's refusal rather than claiming it started", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ message: "Workflow does not have 'workflow_dispatch' trigger" }, { status: 422 })));
    const out = await runAnchor("owner@example.com", { action: "mix" });
    expect(out).toEqual({ ok: false, message: expect.stringContaining("workflow_dispatch") });
  });
});

describe("toDrop", () => {
  it("resolves a relative cover against the repo and keeps the links", () => {
    expect(toDrop({ id: "2026-09-04", date: "2026-09-04", title: "Then Do It", lane_name: "Rawstyle Hybrid", bpm: 129, cover: "covers/2026-09-04.jpg", youtube_url: "https://youtu.be/x" }))
      .toMatchObject({ title: "Then Do It", lane: "Rawstyle Hybrid", bpm: 129, cover: "https://raw.githubusercontent.com/Anchit-AI-Hustle/anchor-autopilot/main/site/covers/2026-09-04.jpg", youtubeUrl: "https://youtu.be/x", audioUrl: null });
  });
});

describe("confirm-then-act", () => {
  it("lets Jarvis read ANCHOR's status freely but confirms anything that publishes", () => {
    expect(isSensitive("anchor", { action: "status" })).toBe(false);
    for (const action of ["run_drop", "rehearse", "queue_song", "mix"]) expect(isSensitive("anchor", { action })).toBe(true);
    expect(summarizeAction("anchor", { action: "queue_song", song: SONG })).toContain(SONG);
  });

  it("is checked with the call's arguments on every provider path", () => {
    // The tool-calling fallback passed the name alone, so an ANCHOR run read as
    // "status", skipped the confirmation and never ran.
    const chat = readFileSync(path.resolve(__dirname, "../../app/api/chat/route.ts"), "utf8");
    const calls = [...chat.matchAll(/isSensitive\(([^)]*)\)/g)].map((m) => m[1]);
    expect(calls.length).toBeGreaterThanOrEqual(1);
    for (const args of calls) expect(args).toContain(",");
    // Both the Gemini loop and the tool-calling fallback run tools through the one executor.
    expect((chat.match(/await execute\(/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });
});
