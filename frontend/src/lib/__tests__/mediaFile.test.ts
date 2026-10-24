import { afterEach, describe, expect, it, vi } from "vitest";
import { contentDisposition, isProviderMedia, mediaFilename, saveBlob } from "@/lib/mediaFile";

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

describe("saving a file without leaving the page", () => {
  const ua = navigator.userAgent;
  const setUa = (v: string) => Object.defineProperty(navigator, "userAgent", { value: v, configurable: true });
  afterEach(() => {
    setUa(ua);
    delete (navigator as { share?: unknown }).share;
    delete (navigator as { canShare?: unknown }).canShare;
    document.body.innerHTML = "";
  });

  it("on iPhone, hands the file to the share sheet instead of a download link that replaces the app", async () => {
    setUa("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)");
    const share = vi.fn(async () => undefined);
    Object.assign(navigator, { share, canShare: () => true });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click");
    await saveBlob(new Blob(["x"], { type: "video/mp4" }), "Kraethon-Cipher.mp4");
    expect(share).toHaveBeenCalledWith({ files: [expect.objectContaining({ name: "Kraethon-Cipher.mp4", type: "video/mp4" })] });
    expect(click).not.toHaveBeenCalled();
    click.mockRestore();
  });

  it("asks for one more tap when the download outlasted the original tap", async () => {
    setUa("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)");
    const share = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error("no gesture"), { name: "NotAllowedError" }))
      .mockResolvedValueOnce(undefined);
    Object.assign(navigator, { share, canShare: () => true });
    const saved = saveBlob(new Blob(["x"], { type: "audio/mpeg" }), "song.mp3");
    const button = await vi.waitFor(() => {
      const b = document.querySelector("button");
      if (!b) throw new Error("no button yet");
      return b;
    });
    expect(button.textContent).toBe("Save song.mp3");
    button.click();
    await saved;
    expect(share).toHaveBeenCalledTimes(2);
    expect(document.querySelector("button")).toBeNull();
  });

  it("reports a share failure so the caller can show it, but not a cancel", async () => {
    setUa("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)");
    const share = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error("bad file"), { name: "DataError" }))
      .mockRejectedValueOnce(Object.assign(new Error("cancelled"), { name: "AbortError" }));
    Object.assign(navigator, { share, canShare: () => true });
    await expect(saveBlob(new Blob(["x"]), "a.mp3")).rejects.toThrow("bad file");
    await expect(saveBlob(new Blob(["x"]), "a.mp3")).resolves.toBeUndefined();
  });

  it("elsewhere, downloads through a link", async () => {
    setUa("Mozilla/5.0 (Windows NT 10.0; Win64; x64)");
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    URL.createObjectURL = vi.fn(() => "blob:x");
    await saveBlob(new Blob(["x"], { type: "audio/mpeg" }), "song.mp3");
    expect(click).toHaveBeenCalledTimes(1);
    click.mockRestore();
  });
});
