import { afterEach, describe, expect, it, vi } from "vitest";
import { embedBatch } from "@/lib/cortex/embed";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("embedBatch", () => {
  it("embeds 100 texts per request, in order, and marks a failed batch as missing", async () => {
    vi.stubEnv("GEMINI_API_KEY", "k");
    let call = 0;
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const n = JSON.parse(String(init?.body)).requests.length;
      if (call++ === 1) return new Response("quota", { status: 429 });
      return Response.json({ embeddings: Array.from({ length: n }, (_, i) => ({ values: [i] })) });
    });
    vi.stubGlobal("fetch", fetchMock);
    const out = await embedBatch(Array.from({ length: 150 }, (_, i) => `t${i}`));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0][0])).toContain(":batchEmbedContents");
    expect(out.slice(0, 2)).toEqual([[0], [1]]);
    expect(out.slice(100)).toEqual(Array(50).fill(null));
  });
});
