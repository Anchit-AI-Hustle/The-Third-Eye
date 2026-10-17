import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/replicate", () => ({ replicateConfigured: () => false, createPrediction: vi.fn(), getPrediction: vi.fn(), audioUrlFrom: vi.fn() }));
vi.mock("@/lib/push", () => ({ sendPush: vi.fn(async () => true) }));
vi.mock("@/lib/llmCascade", () => ({ llmCascade: vi.fn(async () => ({ text: '{"title":"Monsoon Drive","description":"warm night rain"}' })) }));
vi.mock("@/lib/music/agents", () => ({
  planSong: vi.fn(async () => ({
    brief: { bpm: 92, energy: 4, moods: ["warm"] },
    plan: { prompt: "warm lofi", tags: "lofi, 92 BPM", lyrics: "" },
    sing: false,
  })),
}));

import { runDaily } from "@/lib/music/daily";
import { createPrediction } from "@/lib/replicate";

type Row = Record<string, unknown>;
function fakeDb(tables: Record<string, Row[]>) {
  return {
    from(table: string) {
      const filters: ((r: Row) => boolean)[] = [];
      let pending: { op: "insert" | "update" | "delete"; data?: Row } | null = null;
      const rows = () => (tables[table] ??= []).filter((r) => filters.every((f) => f(r)));
      const run = () => {
        if (pending?.op === "update") rows().forEach((r) => Object.assign(r, pending!.data));
        if (pending?.op === "delete") tables[table] = (tables[table] ?? []).filter((r) => !filters.every((f) => f(r)));
      };
      const q: Record<string, unknown> = new Proxy({
        eq: (c: string, v: unknown) => { filters.push((r) => r[c] === v); return q; },
        lt: (c: string, v: unknown) => { filters.push((r) => String(r[c]) < String(v)); return q; },
        insert: (r: Row) => { const row = { id: `${table}-${(tables[table] ??= []).length + 1}`, ...r }; tables[table].push(row); pending = { op: "insert", data: row }; return q; },
        update: (d: Row) => { pending = { op: "update", data: d }; return q; },
        delete: () => { pending = { op: "delete" }; return q; },
        single: async () => ({ data: pending?.data ?? null, error: null }),
        maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
        then: (res: (v: unknown) => unknown) => { run(); return res({ data: rows(), error: null }); },
      } as Record<string, unknown>, { get: (t, k: string) => (k in t ? t[k] : () => q) });
      return q;
    },
  };
}

describe("Daily Drop without a music model", () => {
  it("composes today's track in code, stores it and marks it done", async () => {
    const tables: Record<string, Row[]> = { music_daily: [{ user_id: "u", preset: { description: "lofi", duration: 30 }, refs: "" }] };
    const r = await runDaily(fakeDb(tables) as never, "u", "2026-10-17");
    expect(r).toBe("started");
    expect(createPrediction).not.toHaveBeenCalled();
    const track = tables.music_daily_tracks[0];
    expect(track).toMatchObject({ status: "done", audio_type: "audio/wav", title: "Monsoon Drive" });
    expect(String(track.tags)).toMatch(/composed in code/);
    const audio = Buffer.concat((tables.music_daily_chunks ?? []).map((c) => c.data as Buffer));
    expect(audio.subarray(0, 4).toString()).toBe("RIFF");
    expect(track.size).toBe(audio.length);
  });
});
