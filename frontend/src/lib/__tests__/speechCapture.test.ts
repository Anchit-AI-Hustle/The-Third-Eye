import { afterEach, describe, expect, it, vi } from "vitest";
import { transcribeSpeechSegment } from "@/lib/speechCapture";

afterEach(() => vi.unstubAllGlobals());

describe("transcribeSpeechSegment", () => {
  it("does not send empty or near-empty audio", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await transcribeSpeechSegment(new Blob([]))).toBe("");
    expect(await transcribeSpeechSegment(new Blob([new Uint8Array(999)]))).toBe("");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends one audio segment with its language and trims the response", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify({ text: "  Hello there.  " }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const audio = new Blob([new Uint8Array(1200)], { type: "audio/wav" });
    await expect(transcribeSpeechSegment(audio, "en-US")).resolves.toBe("Hello there.");
    const [, init] = fetchMock.mock.calls[0];
    expect((init?.body as FormData).get("lang")).toBe("en-US");
    expect((init?.body as FormData).get("audio")).toBeInstanceOf(File);
  });

  it("surfaces failed model requests for the caller to handle", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("unavailable", { status: 503 })));
    await expect(transcribeSpeechSegment(new Blob([new Uint8Array(1200)]))).rejects.toThrow("503");
  });
});
