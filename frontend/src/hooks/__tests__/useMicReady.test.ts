import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useMicReady } from "@/hooks/useMicReady";
import { setPolicy } from "@/lib/consent";

function stubBrowserPermission(state: PermissionState | null) {
  Object.defineProperty(navigator, "permissions", {
    configurable: true,
    value: state === null ? undefined : { query: vi.fn().mockResolvedValue({ state, addEventListener: vi.fn(), removeEventListener: vi.fn() }) },
  });
}

afterEach(() => { localStorage.clear(); });

describe("useMicReady", () => {
  it("is not ready with no grant of any kind", async () => {
    stubBrowserPermission("prompt");
    const { result } = renderHook(() => useMicReady());
    await act(async () => { await Promise.resolve(); });
    expect(result.current.ready).toBe(false);
  });

  it("counts the browser's standing grant, so 'Allow once' users still get the wake word", async () => {
    stubBrowserPermission("granted");
    const { result } = renderHook(() => useMicReady());
    await act(async () => { await Promise.resolve(); });
    expect(result.current.ready).toBe(true);
  });

  it("counts 'Allow every time' and a grant made this session", async () => {
    stubBrowserPermission(null);
    const { result } = renderHook(() => useMicReady());
    expect(result.current.ready).toBe(false);
    act(() => result.current.markGranted());
    expect(result.current.ready).toBe(true);

    const fresh = renderHook(() => useMicReady());
    expect(fresh.result.current.ready).toBe(false);
    act(() => setPolicy("microphone", "always"));
    expect(fresh.result.current.ready).toBe(true);
  });
});
