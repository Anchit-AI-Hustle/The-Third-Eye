import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const enable = vi.fn(async () => {});
let pushState = "off";
vi.mock("@/hooks/usePush", () => ({ usePush: () => ({ state: pushState, enable }) }));
import { FirstRunGuide } from "@/components/onboarding/FirstRunGuide";

afterEach(() => { localStorage.clear(); vi.unstubAllGlobals(); vi.clearAllMocks(); delete (window as { Capacitor?: unknown }).Capacitor; });

describe("first-run guide", () => {
  it("walks through voice and notifications, bringing data in, and three things to try", async () => {
    const stop = vi.fn();
    vi.stubGlobal("navigator", { ...navigator, mediaDevices: { getUserMedia: vi.fn(async () => ({ getTracks: () => [{ stop }] })) } });
    render(<FirstRunGuide />);

    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Allow microphone and notifications/i })); });
    expect(stop).toHaveBeenCalled();
    expect(enable).toHaveBeenCalled();
    expect(screen.getByText(/Voice and notifications are on/i)).toBeInTheDocument();

    expect(screen.getByRole("link", { name: /Import contacts and files/i })).toHaveAttribute("href", "/settings");
    expect(screen.getByRole("link", { name: "What's on my plate today?" })).toHaveAttribute("href", "/assistant?ask=What's%20on%20my%20plate%20today%3F");
    expect(screen.getAllByRole("link", { name: /\?|briefing|pm/ }).length).toBeGreaterThanOrEqual(3);
  });

  it("in the phone app, asks for on-phone notifications and offers the folder to sync", async () => {
    const LocalNotifications = { requestPermissions: vi.fn(async () => ({ display: "granted" })) };
    const DeviceSync = { chooseFolder: vi.fn(async () => ({ name: "iCloud Drive" })) };
    (window as { Capacitor?: unknown }).Capacitor = { getPlatform: () => "ios", isNativePlatform: () => true, Plugins: { LocalNotifications, DeviceSync } };
    vi.stubGlobal("navigator", { ...navigator, mediaDevices: { getUserMedia: vi.fn(async () => ({ getTracks: () => [] })) } });
    render(<FirstRunGuide />);

    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Allow microphone and notifications/i })); });
    expect(LocalNotifications.requestPermissions).toHaveBeenCalled();
    expect(enable).not.toHaveBeenCalled();

    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Choose a folder/i })); });
    expect(DeviceSync.chooseFolder).toHaveBeenCalled();
    expect(screen.getByText(/iCloud Drive syncs on its own/i)).toBeInTheDocument();
  });

  it("goes away for good once finished or skipped", () => {
    const { unmount } = render(<FirstRunGuide />);
    fireEvent.click(screen.getByRole("button", { name: "Skip" }));
    expect(screen.queryByText(/Get set up/i)).toBeNull();
    unmount();
    render(<FirstRunGuide />);
    expect(screen.queryByText(/Get set up/i)).toBeNull();
  });
});
