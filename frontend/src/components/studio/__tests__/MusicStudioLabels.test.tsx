import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MusicStudio } from "@/components/studio/MusicStudio";

vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({})));
afterEach(cleanup);

describe("Music Studio fields", () => {
  it("each has an accessible name from its visible label, with the AI toolbar outside it", () => {
    // Moving the toolbar out of <label> had left the ranges and pickers unnamed.
    render(<MusicStudio />);
    for (const name of [/Music prompt/, "Track name", "Artist inspiration", "Genres", "Sub-genre", "Moods", "Instruments", /Tempo \(BPM\)/, /Energy/, "Song structure", /Session length/]) {
      const control = screen.getByLabelText(name);
      expect(["INPUT", "TEXTAREA"]).toContain(control.tagName);
    }
    expect(document.querySelectorAll("label button")).toHaveLength(0);
  });
});
