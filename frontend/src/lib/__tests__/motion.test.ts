import { afterEach, describe, expect, it, vi } from "vitest";
import { MOTION_EVENT, reducedMotion, setMotionPref } from "@/lib/motion";

function device(reduce: boolean) {
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: reduce && q.includes("reduce"), addEventListener() {}, removeEventListener() {} }));
}
afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); document.documentElement.removeAttribute("data-motion-full"); });

describe("motion preference", () => {
  it("follows a device that asks for reduced motion by default", () => {
    device(true);
    expect(reducedMotion()).toBe(true);
    expect(document.documentElement.hasAttribute("data-motion-full")).toBe(false);
  });

  it("runs animations when the user turns them on, and tells listeners", () => {
    device(true);
    const heard = vi.fn();
    window.addEventListener(MOTION_EVENT, heard);
    setMotionPref("full");
    expect(reducedMotion()).toBe(false);
    expect(document.documentElement.hasAttribute("data-motion-full")).toBe(true);
    expect(heard).toHaveBeenCalledOnce();
    setMotionPref("device");
    expect(reducedMotion()).toBe(true);
    expect(document.documentElement.hasAttribute("data-motion-full")).toBe(false);
  });

  it("animates on a device without Reduce Motion", () => {
    device(false);
    expect(reducedMotion()).toBe(false);
  });
});
