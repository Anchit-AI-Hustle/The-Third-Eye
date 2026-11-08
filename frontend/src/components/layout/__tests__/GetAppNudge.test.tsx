import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, fireEvent } from "@testing-library/react";

let pathname = "/dashboard";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));

import { GetAppNudge, NUDGE_DELAY_MS } from "@/components/layout/GetAppNudge";

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36";
const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

function asDevice(ua: string, standalone = false) {
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue(ua);
  Object.defineProperty(window, "matchMedia", { configurable: true, value: () => ({ matches: standalone }) });
}

beforeEach(() => { vi.useFakeTimers(); localStorage.clear(); pathname = "/dashboard"; });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

async function after(ms: number) { await act(async () => { vi.advanceTimersByTime(ms); }); }

describe("get-the-app nudge", () => {
  it("lets a phone use the mobile website for 30 seconds, then offers the app from /get", async () => {
    asDevice(IPHONE);
    render(<GetAppNudge />);
    await after(NUDGE_DELAY_MS - 1000);
    expect(screen.queryByRole("dialog")).toBeNull();
    await after(1000);
    expect(screen.getByRole("link", { name: "Get the app" }).getAttribute("href")).toBe("/get");
  });

  it("shows on Android too", async () => {
    asDevice(ANDROID);
    render(<GetAppNudge />);
    await after(NUDGE_DELAY_MS);
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("never shows on a computer or inside the installed app", async () => {
    asDevice(MAC);
    const { unmount } = render(<GetAppNudge />);
    await after(NUDGE_DELAY_MS * 2);
    expect(screen.queryByRole("dialog")).toBeNull();
    unmount();
    asDevice(IPHONE, true);
    render(<GetAppNudge />);
    await after(NUDGE_DELAY_MS * 2);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("stays away on the download and sign-in pages", async () => {
    asDevice(IPHONE);
    pathname = "/get";
    render(<GetAppNudge />);
    await after(NUDGE_DELAY_MS);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("stays dismissed for a week after 'Not now'", async () => {
    asDevice(IPHONE);
    const { unmount } = render(<GetAppNudge />);
    await after(NUDGE_DELAY_MS);
    fireEvent.click(screen.getByRole("button", { name: "Not now" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    unmount();
    render(<GetAppNudge />);
    await after(NUDGE_DELAY_MS);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
