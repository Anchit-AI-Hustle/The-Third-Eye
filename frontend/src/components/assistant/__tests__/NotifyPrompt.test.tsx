import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next-auth/react", () => ({ useSession: () => ({ data: { user: { email: "me@x.com" } } }) }));
import { NotifyPrompt } from "@/components/assistant/NotifyPrompt";

function browser(permission: NotificationPermission, grant: NotificationPermission = "granted") {
  const subscribe = vi.fn(async () => ({ toJSON: () => ({ endpoint: "https://push.example/1" }) }));
  vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "BElz");
  vi.stubGlobal("PushManager", function PushManager() {});
  vi.stubGlobal("Notification", { permission, requestPermission: vi.fn(async () => grant) });
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: { ready: Promise.resolve({ pushManager: { getSubscription: async () => null, subscribe } }) },
  });
  const fetchMock = vi.fn(async () => new Response("{}"));
  vi.stubGlobal("fetch", fetchMock);
  return { subscribe, fetchMock };
}

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); localStorage.clear(); });

describe("turning on phone notifications", () => {
  it("asks on a tap, then registers this phone for reminders and the morning briefing", async () => {
    const { subscribe, fetchMock } = browser("default");
    render(<NotifyPrompt />);
    await act(async () => { fireEvent.click(await screen.findByRole("button", { name: /Turn on/i })); });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/push/subscribe", expect.objectContaining({ method: "POST" })));
    expect(subscribe).toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /Turn on/i })).toBeNull();
  });

  it("stays hidden once notifications are on, and after it is dismissed", async () => {
    browser("granted");
    const { unmount } = render(<NotifyPrompt />);
    await new Promise((r) => setTimeout(r, 10));
    expect(screen.queryByRole("button", { name: /Turn on/i })).toBeNull();
    unmount();

    browser("default");
    const second = render(<NotifyPrompt />);
    fireEvent.click(await screen.findByRole("button", { name: /Not now/i }));
    second.unmount();
    render(<NotifyPrompt />);
    await new Promise((r) => setTimeout(r, 10));
    expect(screen.queryByRole("button", { name: /Turn on/i })).toBeNull();
  });
});
