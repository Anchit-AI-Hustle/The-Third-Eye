// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/llmCascade", () => ({ llmCascade: vi.fn() }));

import { llmCascade } from "@/lib/llmCascade";
import { DAILY_GENRES, dailyGenre, presetForDay, variation } from "@/lib/music/daily";
import { coinedTitle, originalTitle, titleTaken } from "@/lib/music/originality";

const cascade = vi.mocked(llmCascade);
// MusicBrainz search is fuzzy, so near misses come back too; only an exact title counts.
const released = (titles: string[]) =>
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ recordings: titles.map((title) => ({ title })) })));

afterEach(() => { vi.unstubAllGlobals(); cascade.mockReset(); });

describe("song title originality", () => {
  it("knows a released song's title, ignoring case and remix tags", async () => {
    released(["Victory Lap (Remix)"]);
    expect(await titleTaken("victory lap")).toBe(true);
    expect(await titleTaken("Vorakai Ledger")).toBe(false);
  });

  it("treats a failed lookup as taken, so an unchecked title never ships", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("busy", { status: 503 })));
    expect(await titleTaken("Anything")).toBe(true);
  });

  it("swaps a released title for a coined one, the same for the same seed", async () => {
    released(["Victory Lap"]);
    const t = await originalTitle("Victory Lap", "seed", "Hip-Hop");
    expect(t).not.toMatch(/victory lap/i);
    expect(t).toBe(coinedTitle("seed", "Hip-Hop"));
    expect(t).toMatch(/^[A-Z][a-z]+ (Ledger|Blueprint|Cipher|Testament|Verdict|Dossier)$/);
  });

  it("asks again when the daily concept's title is already a song", async () => {
    released(["Victory Lap"]);
    cascade
      .mockResolvedValueOnce({ text: '{"title":"Victory Lap","description":"a"}' } as never)
      .mockResolvedValueOnce({ text: '{"title":"Kraethon Cipher","description":"b"}' } as never);
    expect(await variation({ genre: "Rap" }, "", [], "2026-10-24")).toEqual({ title: "Kraethon Cipher", description: "b" });
    expect(JSON.stringify(cascade.mock.calls[1][0].messages)).toContain("Victory Lap");
  });

  it("falls back to a coined title when every try is taken", async () => {
    released(["Victory Lap"]);
    cascade.mockResolvedValue({ text: '{"title":"Victory Lap","description":"a"}' } as never);
    const v = await variation({ genre: "Rap" }, "", [], "2026-10-24");
    expect(v.title).toBe(coinedTitle("2026-10-24|Rap", "Rap"));
    expect(cascade).toHaveBeenCalledTimes(3);
  });
});

describe("daily drop genres", () => {
  it("rotates through hard techno, psy, rap, hip-hop and their blends", () => {
    const start = Date.parse("2026-10-24T00:00:00Z");
    const days = DAILY_GENRES.map((_, i) => dailyGenre(new Date(start + i * 86_400_000).toISOString().slice(0, 10)));
    expect(new Set(days)).toEqual(new Set(DAILY_GENRES));
    for (const g of ["Hard Techno", "Psytrance", "Rap", "Hip-Hop"]) expect(DAILY_GENRES).toContain(g);
    expect(DAILY_GENRES.some((g) => g.includes("+"))).toBe(true);
  });

  it("drops the saved genre's tempo and instruments so the day's genre sets them", () => {
    const p = presetForDay({ genre: "Pop", tempo: 100, instruments: "piano", subgenre: "synth-pop", vocalLanguage: "Hindi", duration: 60 }, "2026-10-24");
    expect(p).toEqual({ genre: dailyGenre("2026-10-24"), vocalLanguage: "Hindi", duration: 60 });
  });
});
