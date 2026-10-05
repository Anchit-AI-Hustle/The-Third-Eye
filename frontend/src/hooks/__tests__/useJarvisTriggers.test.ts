import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useJarvisTriggers } from "@/hooks/useJarvisTriggers";
import { DEFAULT_CONFIG, saveActivation } from "@/lib/activation";

describe("useJarvisTriggers", () => {
  beforeEach(() => {
    localStorage.clear();
    saveActivation(DEFAULT_CONFIG);
  });

  it("fires on Cmd+J", () => {
    const onActivate = vi.fn();
    renderHook(() => useJarvisTriggers(onActivate));
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "j", metaKey: true, bubbles: true }));
    });
    expect(onActivate).toHaveBeenCalledTimes(1);
  });

  it("does not fire when typing in an input", () => {
    const onActivate = vi.fn();
    renderHook(() => useJarvisTriggers(onActivate));
    const input = document.createElement("input");
    document.body.appendChild(input);
    act(() => {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "j", metaKey: true, bubbles: true }));
    });
    input.remove();
    expect(onActivate).not.toHaveBeenCalled();
  });
});
