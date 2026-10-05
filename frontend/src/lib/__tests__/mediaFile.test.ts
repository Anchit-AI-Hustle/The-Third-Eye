import { describe, expect, it } from "vitest";
import { contentDisposition, isProviderMedia, mediaFilename } from "@/lib/mediaFile";

describe("media filenames", () => {
  it("names a file from the content type, not from opening it in a player", () => {
    expect(mediaFilename("hard techno", "audio/mpeg")).toBe("hard-techno.mp3");
    expect(mediaFilename("clip", "video/mp4")).toBe("clip.mp4");
    expect(mediaFilename("clip", "video/webm")).toBe("clip.webm");
    expect(mediaFilename("take", "audio/wav")).toBe("take.wav");
  });

  it("sniffs a typeless provider file", () => {
    const id3 = new Uint8Array([0x49, 0x44, 0x33, 0x04]);
    expect(mediaFilename("song", "application/octet-stream", "/output_2026", id3)).toBe("song.mp3");
    const ftyp = new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]);
    expect(mediaFilename("clip", null, "", ftyp)).toBe("clip.mp4");
  });

  it("uses the path extension when the type is generic", () => {
    expect(mediaFilename("out", "application/octet-stream", "/a/track.wav")).toBe("out.wav");
  });

  it("marks the response as a download", () => {
    expect(contentDisposition("hard-techno.mp3")).toBe('attachment; filename="hard-techno.mp3"');
  });

  it("recognises provider media hosts", () => {
    expect(isProviderMedia("https://replicate.delivery/x/output_1")).toBe(true);
    expect(isProviderMedia("https://example.com/a.mp4")).toBe(false);
  });
});
