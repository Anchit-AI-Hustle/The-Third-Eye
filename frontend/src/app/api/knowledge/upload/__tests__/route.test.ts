// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

let email: string | null = "me@x.com";
vi.mock("next-auth", () => ({ getServerSession: async () => (email ? { user: { email } } : null) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
const inserted: Record<string, unknown>[] = [];
vi.mock("@/lib/db", () => ({ getDb: () => ({ from: () => ({ insert: async (rows: Record<string, unknown>[]) => { inserted.push(...rows); return { error: null }; } }) }) }));
const ingest = vi.fn(async () => ({ chunks: 1 }));
vi.mock("@/lib/cortex", () => ({ cortexEnabled: () => true, ingestDocument: (...a: unknown[]) => ingest(...(a as [])) }));

import { POST } from "@/app/api/knowledge/upload/route";

const upload = (...files: File[]) => {
  const form = new FormData();
  for (const f of files) form.append("file", f);
  return POST(new Request("https://app.test/api/knowledge/upload", { method: "POST", body: form }) as never);
};

beforeEach(() => { email = "me@x.com"; inserted.length = 0; ingest.mockClear(); });

describe("native Knowledge upload", () => {
  it("reads a text file, saves it for the signed-in account and indexes it", async () => {
    const res = await upload(new File(["Quarterly plan: ship the app."], "plan.md", { type: "text/markdown" }));
    expect(res.status).toBe(200);
    const { docs } = await res.json();
    expect(docs[0]).toMatchObject({ title: "plan.md", file_type: "md", processing_status: "ready", content: "Quarterly plan: ship the app." });
    expect(inserted[0]).toMatchObject({ user_id: "me@x.com", title: "plan.md" });
    expect(ingest).toHaveBeenCalledWith("me@x.com", docs[0].id, "plan.md", "Quarterly plan: ship the app.");
  });

  it("keeps an unreadable file as failed, with the reason, and does not index it", async () => {
    const { docs } = await (await upload(new File([new Uint8Array([1, 2, 3])], "song.mp3"))).json();
    expect(docs[0]).toMatchObject({ processing_status: "failed", error: expect.stringMatching(/MP3/) });
    expect(ingest).not.toHaveBeenCalled();
  });

  it("refuses an upload over 4 MB and a request without a file or a session", async () => {
    expect((await upload(new File([new Uint8Array(4 * 1024 * 1024 + 1)], "big.txt"))).status).toBe(413);
    expect((await upload()).status).toBe(400);
    email = null;
    expect((await upload(new File(["x"], "a.txt"))).status).toBe(401);
    expect(inserted).toEqual([]);
  });
});
