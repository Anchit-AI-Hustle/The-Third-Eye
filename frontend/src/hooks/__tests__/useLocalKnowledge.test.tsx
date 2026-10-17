import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-auth/react", () => ({ useSession: () => ({ data: { user: { email: "me@x.com" } } }) }));
let rows: { id: string; title: string }[] = [];
vi.mock("@/lib/dataClient", () => ({
  dataList: async () => ({ remote: true, rows }),
  dataInsert: vi.fn(async () => true),
  dataDelete: vi.fn(async (_e: string, id: string) => { rows = rows.filter((r) => r.id !== id); return true; }),
}));

import { useLocalKnowledge } from "@/hooks/useLocalKnowledge";

const doc = (id: string, title: string) => ({ id, title, content: "x", file_type: "txt", file_size_bytes: 1, created_at: "", chunk_count: 1, processing_status: "ready" as const });

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("fetch", vi.fn(async () => new Response("{}")));
});

describe("knowledge documents with a database", () => {
  it("a deleted document stays deleted after the page reloads", async () => {
    rows = [doc("a", "Keep"), doc("b", "Delete me")];
    const first = renderHook(() => useLocalKnowledge());
    await waitFor(() => expect(first.result.current.docs).toHaveLength(2));
    await act(async () => { await first.result.current.remove("b"); });
    first.unmount();
    const again = renderHook(() => useLocalKnowledge());
    await waitFor(() => expect(again.result.current.ready).toBe(true));
    expect(again.result.current.docs.map((d) => d.id)).toEqual(["a"]);
  });

  it("does not copy documents another account left on this browser into this one", async () => {
    rows = [];
    localStorage.setItem("jarvis_knowledge_v1", JSON.stringify([doc("z", "Someone else's")]));
    const { result } = renderHook(() => useLocalKnowledge());
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.docs).toEqual([]);
    const { dataInsert } = await import("@/lib/dataClient");
    expect(dataInsert).not.toHaveBeenCalled();
  });

  it("stores a Word file's real text, and marks an unreadable PDF failed instead of ready", async () => {
    rows = [];
    const { strToU8, zipSync } = await import("fflate");
    const docx = zipSync({ "word/document.xml": strToU8('<w:document><w:body><w:p><w:r><w:t>Board meeting on Friday</w:t></w:r></w:p></w:body></w:document>') });
    const { result } = renderHook(() => useLocalKnowledge());
    await waitFor(() => expect(result.current.ready).toBe(true));
    let made: Awaited<ReturnType<typeof result.current.upload>> = [];
    await act(async () => {
      made = await result.current.upload([
        new File([docx], "agenda.docx"),
        new File(["%PDF-1.4 garbage \x00\x01"], "scan.pdf", { type: "application/pdf" }),
      ]);
    });
    expect(made[0]).toMatchObject({ title: "agenda.docx", processing_status: "ready", content: "Board meeting on Friday" });
    expect(made[1]).toMatchObject({ title: "scan.pdf", processing_status: "failed", content: "" });
    expect(made[1].error).toMatch(/couldn't read/i);
  });
});
