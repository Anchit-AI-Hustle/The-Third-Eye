import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SignInClient } from "./SignInClient";

const getCsrfToken = vi.fn();

vi.mock("next-auth/react", () => ({
  getCsrfToken: () => getCsrfToken(),
}));

describe("SignInClient", () => {
  beforeEach(() => {
    getCsrfToken.mockReset();
    getCsrfToken.mockResolvedValue("csrf-test");
    localStorage.setItem("te_welcome_seen", "1");
    localStorage.removeItem("te_webclip");
    // jsdom has no matchMedia; the welcome and sign-in backdrop reads reduced motion.
    window.matchMedia = ((query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
  });

  it("posts straight to Google sign-in with a fresh csrf token", async () => {
    const { container } = render(<SignInClient callbackUrl="/dashboard" initialError={null} />);
    const form = container.querySelector("form");
    expect(form?.getAttribute("method")).toBe("post");
    expect(form?.getAttribute("action")).toBe("/api/auth/signin/google");
    expect(container.querySelector("input[name=json]")).toBeNull();
    expect(container.querySelector("input[name=callbackUrl]")?.getAttribute("value")).toBe("/dashboard");

    await waitFor(() => {
      expect(container.querySelector("input[name=csrfToken]")?.getAttribute("value")).toBe("csrf-test");
    });
    expect(getCsrfToken).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeEnabled();
  });

  it("lets the browser POST so Google can set the state cookie", async () => {
    const { container } = render(<SignInClient callbackUrl="/dashboard" initialError={null} />);
    await waitFor(() => {
      expect(container.querySelector("input[name=csrfToken]")?.getAttribute("value")).toBe("csrf-test");
    });
    const form = container.querySelector("form");
    expect(form).toBeTruthy();
    const event = new Event("submit", { bubbles: true, cancelable: true });
    act(() => {
      form!.dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(false);
  });

  it("shows the Google error that brought the browser back", async () => {
    render(<SignInClient callbackUrl="/dashboard" initialError="OAuthCallback" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Google didn't finish");
    expect(screen.getByRole("alert")).toHaveTextContent("OAuthCallback");
    await waitFor(() => expect(getCsrfToken).toHaveBeenCalled());
  });

  it("in the iPhone home-screen app, signs in through Safari and picks the session up when approved", async () => {
    Object.defineProperty(window.navigator, "standalone", { value: true, configurable: true });
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    const assign = vi.fn();
    Object.defineProperty(window, "location", { value: { ...window.location, assign }, configurable: true });
    let approved = false;
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") return new Response(null, { status: 204 });
      return Response.json({ signedIn: approved });
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.useFakeTimers({ shouldAdvanceTime: true });

    render(<SignInClient callbackUrl="/dashboard" initialError={null} />);
    await act(async () => { screen.getByRole("button", { name: "Continue with Google" }).click(); });

    const [, start] = fetchMock.mock.calls[0];
    const code = JSON.parse(String(start!.body)).code as string;
    expect(code).toMatch(/^[0-9a-f]{64}$/);
    expect(open).toHaveBeenCalledWith(`/auth/handoff?code=${code}`, "_blank");
    // Opened before any network wait: iOS blocks a window opened after the tap's moment has passed.
    expect(open.mock.invocationCallOrder[0]).toBeLessThan(fetchMock.mock.invocationCallOrder[0]);
    expect(screen.getByText(code.slice(0, 4).toUpperCase())).toBeTruthy();
    // If iOS swallowed the window, there is still something to tap.
    expect(screen.getByRole("link", { name: /Open Safari to sign in/i })).toHaveAttribute("href", `/auth/handoff?code=${code}`);

    approved = true;
    await act(async () => { await vi.advanceTimersByTimeAsync(2500); });
    expect(assign).toHaveBeenCalledWith("/dashboard");

    vi.useRealTimers();
    vi.unstubAllGlobals();
    open.mockRestore();
    delete (window.navigator as { standalone?: boolean }).standalone;
  });

  it("in the installed iPhone web clip, signs in with Google right inside the app", async () => {
    Object.defineProperty(window.navigator, "standalone", { value: true, configurable: true });
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    render(<SignInClient callbackUrl="/dashboard?app=webclip" initialError={null} />);
    const button = await screen.findByRole("button", { name: "Continue with Google" });
    await waitFor(() => expect(button).not.toBeDisabled());
    expect(button.closest("form")).toHaveAttribute("action", "/api/auth/signin/google");
    fireEvent.click(button);
    expect(open).not.toHaveBeenCalled();
    open.mockRestore();
    delete (window.navigator as { standalone?: boolean }).standalone;
  });

  it("in the native iPhone app, also signs in through Safari, since Google refuses sign-in inside an app's web view", async () => {
    (window as { Capacitor?: unknown }).Capacitor = { isNativePlatform: () => true };
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 204 })));

    const { container } = render(<SignInClient callbackUrl="/dashboard" initialError={null} />);
    await act(async () => { screen.getByRole("button", { name: "Continue with Google" }).click(); });

    expect(open).toHaveBeenCalledWith(expect.stringMatching(/^\/auth\/handoff\?code=[0-9a-f]{64}$/), "_blank");
    expect(container.querySelector("form[action='/api/auth/signin/google']")).toBeNull();

    vi.unstubAllGlobals();
    open.mockRestore();
    delete (window as { Capacitor?: unknown }).Capacitor;
  });

  it("in the Android app, opens Google in the phone's browser and signs in when the browser hands the code back", async () => {
    let onUrl: ((e: { url: string }) => void) | undefined;
    const addListener = vi.fn(async (_e: string, cb: (e: { url: string }) => void) => { onUrl = cb; return { remove: vi.fn() }; });
    (window as { Capacitor?: unknown }).Capacitor = { isNativePlatform: () => true, getPlatform: () => "android", Plugins: { App: { addListener } } };
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    const assign = vi.fn();
    Object.defineProperty(window, "location", { value: { ...window.location, assign }, configurable: true });
    const fetchMock = vi.fn(async () => Response.json({ signedIn: true }));
    vi.stubGlobal("fetch", fetchMock);
    const code = "b".repeat(64);

    render(<SignInClient callbackUrl="/dashboard" initialError={null} />);
    await act(async () => { screen.getByRole("button", { name: "Continue with Google" }).click(); });

    expect(open).toHaveBeenCalledWith("/api/app-signin", "_blank");
    expect(addListener).toHaveBeenCalledWith("appUrlOpen", expect.any(Function));
    await act(async () => { onUrl!({ url: `thethirdeye://auth?code=${code}` }); });
    expect(fetchMock).toHaveBeenCalledWith(`/api/auth/handoff?code=${code}`);
    expect(assign).toHaveBeenCalledWith("/dashboard");

    vi.unstubAllGlobals();
    open.mockRestore();
    delete (window as { Capacitor?: unknown }).Capacitor;
  });

  it("welcomes a first-time person in three screens before sign-in, once", async () => {
    localStorage.clear();
    const { unmount } = render(<SignInClient callbackUrl="/dashboard" initialError={null} />);

    expect(screen.getByRole("heading", { name: /Your assistant, always on call/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Continue with Google" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("heading", { name: /It acts, not just answers/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("heading", { name: /Private by design/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Get started" }));
    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeInTheDocument();

    unmount();
    render(<SignInClient callbackUrl="/dashboard" initialError={null} />);
    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeInTheDocument();
  });

  it("lets a person skip the welcome", () => {
    localStorage.clear();
    render(<SignInClient callbackUrl="/dashboard" initialError={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Skip" }));
    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeInTheDocument();
  });
});
