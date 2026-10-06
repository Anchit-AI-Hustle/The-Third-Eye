import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useAgentConfirm, type PendingAction } from "@/hooks/useAgentConfirm";

const action: PendingAction = { id: "email1", tool: "communicate", args: { action: "email", to: "a@example.com" }, summary: "Email", status: "pending" };
afterEach(() => vi.restoreAllMocks());

it("invalidates old confirmations when the user starts a new task", async () => {
  const fetcher = vi.spyOn(globalThis, "fetch");
  const { result } = renderHook(() => useAgentConfirm());
  act(() => result.current.addPending({ ...action }));
  const old = result.current.pendingActions[0];
  act(() => result.current.supersedePending());
  await act(() => result.current.confirmAction(old));
  expect(result.current.pendingActions).toEqual([]);
  expect(fetcher).not.toHaveBeenCalled();
});

it("does not duplicate sends or reopen an old task after a late response", async () => {
  let complete!: (response: Response) => void;
  const fetcher = vi.spyOn(globalThis, "fetch").mockImplementation(() => new Promise((resolve) => { complete = resolve; }));
  const open = vi.spyOn(window, "open").mockReturnValue(null);
  const { result } = renderHook(() => useAgentConfirm());
  act(() => result.current.addPending({ ...action }));
  let pending!: Promise<void>;
  act(() => { pending = result.current.confirmAction(result.current.pendingActions[0]); });
  await act(() => result.current.confirmAction(action));
  expect(fetcher).toHaveBeenCalledTimes(1);
  act(() => result.current.supersedePending());
  await act(async () => { complete(Response.json({ ok: false, openUrl: "https://mail.google.com/", result: "Not connected" })); await pending; });
  expect(result.current.pendingActions).toEqual([]);
  expect(open).not.toHaveBeenCalled();
});

it("keeps a tappable Gmail draft when a direct send is unavailable", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ ok: false, openUrl: "https://mail.google.com/", result: "Not connected" }));
  const open = vi.spyOn(window, "open").mockReturnValue(null);
  const { result } = renderHook(() => useAgentConfirm());
  act(() => result.current.addPending({ ...action }));
  await act(() => result.current.confirmAction(result.current.pendingActions[0]));
  expect(result.current.pendingActions[0]).toMatchObject({ status: "failed", fallbackUrl: "https://mail.google.com/" });
  expect(open).not.toHaveBeenCalled();
});
