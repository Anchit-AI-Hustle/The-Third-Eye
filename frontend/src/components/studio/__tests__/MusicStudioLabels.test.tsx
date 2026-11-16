import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MusicStudio } from "@/components/studio/MusicStudio";

vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({})));
afterEach(cleanup);

describe("Music Studio fields", () => {
  it("keeps result duration and vocal metadata independent of the current form", async () => {
    vi.mocked(fetch).mockImplementation(async (url, opts) => Response.json(String(url) === "/api/tools/music" && opts?.method === "POST" ? {
      configured: true, done: true, audioUrl: "data:audio/wav;base64,fixture", loop: true, clipSeconds: 30, sessionSeconds: 600,
      vocalsRendered: false, fellBackToInstrumental: true, note: "Synthetic instrumental preview",
    } : { data: [] }));
    render(<MusicStudio />);
    fireEvent.change(screen.getByLabelText(/Music prompt/), { target: { value: "Synthetic test" } });
    fireEvent.click(screen.getByRole("button", { name: "Generate music" }));
    await waitFor(() => expect(screen.getByText(/loop target 10m/)).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/Session length/), { target: { value: "120" } });
    expect(screen.getByText(/loop target 10m/)).toBeInTheDocument();
    const saved = JSON.parse(localStorage.getItem("te_music_tracks_v1")!)[0];
    expect(saved.params).toMatchObject({ duration: 600, vocals: false });
  });

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
