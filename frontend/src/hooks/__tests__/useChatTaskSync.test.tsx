import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useChatTaskSync, TASK_SYNC_IDLE_MS } from "@/hooks/useChatTaskSync";

const fetchMock = vi.fn(async (_u: string, _i?: RequestInit) => new Response("{}"));
const sent = () => fetchMock.mock.calls.map(([, init]) => JSON.parse(String(init?.body)).chatId);

beforeEach(() => { vi.useFakeTimers(); fetchMock.mockClear(); vi.stubGlobal("fetch", fetchMock); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("syncing a chat to the Task Tracker", () => {
  it("waits until the chat goes quiet, so a back-and-forth costs one sync", () => {
    const { result } = renderHook(() => useChatTaskSync());
    act(() => result.current.schedule("c1"));
    act(() => { vi.advanceTimersByTime(TASK_SYNC_IDLE_MS - 1000); });
    act(() => result.current.schedule("c1"));
    act(() => { vi.advanceTimersByTime(TASK_SYNC_IDLE_MS - 1000); });
    expect(fetchMock).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(1000); });
    expect(sent()).toEqual(["c1"]);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/chat/sync-tasks");
  });

  it("syncs straight away when the user leaves the chat", () => {
    const { result } = renderHook(() => useChatTaskSync());
    act(() => result.current.schedule("c1"));
    act(() => result.current.flush());
    expect(sent()).toEqual(["c1"]);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ keepalive: true });
    act(() => { vi.advanceTimersByTime(TASK_SYNC_IDLE_MS); });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("syncs the previous chat when another one is scheduled", () => {
    const { result } = renderHook(() => useChatTaskSync());
    act(() => result.current.schedule("c1"));
    act(() => result.current.schedule("c2"));
    expect(sent()).toEqual(["c1"]);
  });

  it("syncs when the page is hidden or closed", () => {
    const { result } = renderHook(() => useChatTaskSync());
    act(() => result.current.schedule("c1"));
    act(() => { window.dispatchEvent(new Event("pagehide")); });
    expect(sent()).toEqual(["c1"]);
  });

  it("does nothing with nothing scheduled", () => {
    const { result } = renderHook(() => useChatTaskSync());
    act(() => result.current.flush());
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
