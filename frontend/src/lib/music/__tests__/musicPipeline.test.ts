import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/llmCascade", () => ({ llmCascade: vi.fn() }));
import { llmCascade } from "@/lib/llmCascade";
import { completeLyrics, conductor, fallbackLyrics, lyricist, musicologist, planSong, songSubject, stripPromptLines } from "@/lib/music/agents";
import { sectionsOf, structuresFor } from "@/lib/music/structures";
import { cleanList, cleanTempo, cleanValue } from "@/lib/music/normalize";
import { lookupGenres } from "@/lib/music/knowledge";
import type { MusicBrief } from "@/lib/music/types";

const cascade = vi.mocked(llmCascade);
const reply = (text: string) => cascade.mockResolvedValueOnce({ text, provider: "test" } as Awaited<ReturnType<typeof llmCascade>>);
afterEach(() => vi.clearAllMocks());

const brief: MusicBrief = {
  genre: "Psytrance", subgenre: "full-on", region: "Global", era: "now", bpm: 200, instruments: ["TB-303"], structure: "",
  moods: ["hypnotic"], energy: 10, vocalStyle: "chanted mantras", referenceArtists: [], culturalContext: "", productionNotes: "",
};

describe("structures", () => {
  it("offers the genre's own structures first", () => {
    const opts = structuresFor(["Psytrance"], "Goa Trance");
    expect(opts[0]).toMatch(/Drop/);
    expect(opts.indexOf("Verse–Chorus–Verse–Chorus–Bridge–Chorus")).toBeGreaterThan(3);
    expect(new Set(opts).size).toBe(opts.length);
  });

  it("turns a structure into lyric section tags", () => {
    expect(sectionsOf("Intro–Kick & Bass (16 bars)–Mantra Breakdown → Drop - Outro")).toEqual(["intro", "kick and bass", "mantra breakdown", "drop", "outro"]);
    expect(sectionsOf("Intro–Verse–Pre-chorus–Chorus")).toEqual(["intro", "verse", "pre-chorus", "chorus"]);
    expect(sectionsOf("AABA")).toEqual([]);
  });
});

describe("tempo", () => {
  it("keeps the user's BPM even when the musicologist would pick the genre average", async () => {
    // "Its Acid Time" asked for 200 and came back at ~144 — the brief is where it has to hold.
    reply(JSON.stringify({ genre: "Psytrance", bpm: 145, energy: 6 }));
    const b = await musicologist({ description: "acid rave", tempo: 320, energy: 10 });
    expect(b.bpm).toBe(320);
    expect(b.energy).toBe(10);
  });

  it("leads the song model's tags with the tempo", () => {
    const plan = conductor({ vocalLanguage: "English" }, brief, { modelPrompt: "p", styleTags: "psychedelic, acid", tempo: 200, arrangement: "" }, "[drop]");
    expect(plan.tags.startsWith("200 bpm, very fast tempo")).toBe(true);
    expect(plan.tags.split(", ").filter((t) => t.toLowerCase() === "psytrance")).toHaveLength(1);
  });

  it("knows genres all the way up to 400 BPM", () => {
    expect(lookupGenres({ genre: "Speedcore" })[0].bpm[1]).toBe(400);
    expect(lookupGenres({ genre: "Hi-Tech Psytrance" })[0].bpm).toEqual([175, 200]);
  });
});

describe("lyrics", () => {
  it("drops a line cut off mid-tag instead of singing '['", () => {
    expect(completeLyrics("[intro]\nom dhyana\n[verse]\nfeel the tremor\n[")).toBe("[intro]\nom dhyana\n[verse]\nfeel the tremor");
    expect(completeLyrics("[verse]\nline\n[cho")).toBe("[verse]\nline");
  });

  it("asks for the chosen structure's sections, sparse club vocals, and romanized Sanskrit", async () => {
    reply("[intro]\n[drop]\nom namah\n[mantra breakdown]\nfeel it\n[outro]");
    const out = await lyricist(
      { structure: "Intro–Drop–Mantra Breakdown–Outro", vocalLanguage: "Sanskrit, English", genre: "Psytrance" },
      brief,
    );
    const system = cascade.mock.calls[0][0].system as string;
    expect(system).toContain("[intro] [drop] [mantra breakdown] [outro]");
    expect(system).toMatch(/vocals are sparse/);
    expect(system).toMatch(/romanized/);
    expect(system).toMatch(/never sing these words|not a lyric/i);
    expect(system).toMatch(/deliberate role/);
    expect(out).toContain("[mantra breakdown]");
  });

  it("always has something to sing when the lyricist is down", async () => {
    cascade.mockRejectedValue(new Error("all providers down"));
    const { plan, sing } = await planSong({ description: "acid rave anthem", title: "Its Acid Time", tempo: 200 });
    expect(sing).toBe(true);
    expect(plan.lyrics).toContain("[chorus]");
    expect(plan.lyrics.toLowerCase()).not.toContain("acid rave anthem");
    expect(plan.tags.startsWith("200 bpm")).toBe(true);
  });

  it("takes the subject out of a create-a-song instruction and sings that", () => {
    expect(songSubject("create hard techno and acid")).toBe("hard techno and acid");
    expect(songSubject("make me a song about the rain")).toBe("the rain");
    const sung = fallbackLyrics({ description: "create hard techno and acid", genre: "Hard Techno" }).toLowerCase();
    expect(sung).not.toContain("hard techno");
    expect(sung).not.toContain("create");
    expect(stripPromptLines("[chorus]\nhard techno and acid\nfeel the night", "create hard techno and acid")).toBe("[chorus]\nfeel the night");
  });
});

describe("normalising AI values", () => {
  it("strips stray punctuation and junk", () => {
    expect(cleanValue("Goa Trance,")).toBe("Goa Trance");
    expect(cleanValue(' "Its Acid Time" ')).toBe("Its Acid Time");
    expect(cleanList("Astrix, 999999999, vini vici, Vini Vici, N/A, Blastoyz", 4)).toEqual(["Astrix", "vini vici", "Blastoyz"]);
    expect(cleanList(["Heavy delay", "voc"], 3)).toEqual(["Heavy delay", "voc"]);
  });

  it("accepts tempos up to 400 and nothing past it", () => {
    expect(cleanTempo("about 380 BPM")).toBe(380);
    expect(cleanTempo(200)).toBe(200);
    expect(cleanTempo(500)).toBeNull();
    expect(cleanTempo("fast")).toBeNull();
  });
});
