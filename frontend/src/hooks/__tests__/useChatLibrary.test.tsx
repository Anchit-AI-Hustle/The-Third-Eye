import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useChatLibrary, type SavedChat } from "@/hooks/useChatLibrary";

const chat = (id: string, updated_at: string, last = "hi"): SavedChat => ({
  id, title: id, project_id: null, updated_at, messages: [{ role: "assistant", content: last }], history: [],
});

let serverChats: unknown[] | "error" = [];
const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
  if (url.startsWith("/api/data/conversations") && (!init?.method || init.method === "GET")) {
    if (serverChats === "error") return new Response("{}", { status: 500 });
    return Response.json({ rows: url.includes("?id=") ? [] : serverChats });
  }
  return Response.json({ rows: [] });
});

beforeEach(() => { localStorage.clear(); serverChats = []; fetchMock.mockClear(); vi.stubGlobal("fetch", fetchMock); });
afterEach(() => vi.unstubAllGlobals());

describe("saved chats", () => {
  it("still lists this browser's chats, newest first, when the account can't be read", async () => {
    localStorage.setItem("te_chats_v1", JSON.stringify([chat("old", "2026-10-01T00:00:00Z"), chat("new", "2026-10-29T00:00:00Z", "Last reply")]));
    serverChats = "error";
    const { result } = renderHook(() => useChatLibrary());
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.chats.map((c) => c.id)).toEqual(["new", "old"]);
    expect(result.current.chats[0].preview).toBe("Last reply");
  });

  it("merges account chats with this browser's, newest first", async () => {
    localStorage.setItem("te_chats_v1", JSON.stringify([chat("here", "2026-10-20T00:00:00Z")]));
    serverChats = [{ id: "phone", title: "phone", project_id: null, updated_at: "2026-10-28T00:00:00Z" }];
    const { result } = renderHook(() => useChatLibrary());
    await waitFor(() => expect(result.current.chats).toHaveLength(2));
    expect(result.current.chats.map((c) => c.id)).toEqual(["phone", "here"]);
  });

  it("keeps a copy here when saving to the account, and reopens it if the account can't", async () => {
    const { result } = renderHook(() => useChatLibrary());
    await waitFor(() => expect(result.current.ready).toBe(true));
    await act(() => result.current.saveChat(chat("c1", "2026-10-30T00:00:00Z")));
    expect(JSON.parse(localStorage.getItem("te_chats_v1")!)[0].id).toBe("c1");
    expect((await result.current.openChat("c1"))?.id).toBe("c1");
  });
});
