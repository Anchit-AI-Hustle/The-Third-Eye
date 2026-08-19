import { describe, expect, it } from "vitest";

import { matchOption, matchOptions } from "@/components/studio/MusicStudio";

// "hard techno rap" autofilled to a single genre chip reading "Techno" — the
// specific match got silently downgraded to a shorter, more generic option
// that happened to sort earlier in the list and also matched as a substring.
// The genre the user actually typed disappeared.

const GENRES = ["Techno", "Hard Techno", "Hip-Hop", "House"];

describe("matchOption: most specific match wins, not first-in-list", () => {
  it("prefers the longer, more specific option over a shorter substring match", () => {
    expect(matchOption("Hard Techno Anthem", GENRES)).toBe("Hard Techno");
  });

  it("still finds an exact match", () => {
    expect(matchOption("Techno", GENRES)).toBe("Techno");
  });

  it("is case-insensitive", () => {
    expect(matchOption("techno", GENRES)).toBe("Techno");
  });

  it("returns null rather than a wrong guess when nothing is close", () => {
    expect(matchOption("Bossa Nova", GENRES)).toBeNull();
  });

  it("returns null for an empty value", () => {
    expect(matchOption("", GENRES)).toBeNull();
  });
});

describe("matchOptions: a multi-select field actually receives multiple values", () => {
  it("splits a blended AI response into separate chips", () => {
    // The bug this fixes: autofill on "hard techno rap" produced one chip
    // ("Techno") instead of reflecting both genres the prompt named.
    expect(matchOptions("Hard Techno, Hip-Hop", GENRES, 6)).toEqual(["Hard Techno", "Hip-Hop"]);
  });

  it("keeps a genuinely novel value verbatim rather than dropping it", () => {
    expect(matchOptions("Amapiano", GENRES, 6)).toEqual(["Amapiano"]);
  });

  it("dedupes when two pieces resolve to the same option", () => {
    expect(matchOptions("Techno, techno", GENRES, 6)).toEqual(["Techno"]);
  });

  it("caps at max", () => {
    expect(matchOptions("Techno, Hard Techno, Hip-Hop, House", GENRES, 2)).toHaveLength(2);
  });

  it("returns nothing for an empty or undefined value", () => {
    expect(matchOptions("", GENRES, 6)).toEqual([]);
    expect(matchOptions(undefined, GENRES, 6)).toEqual([]);
  });
});
