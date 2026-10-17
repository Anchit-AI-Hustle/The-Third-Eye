import { act, render, screen, waitFor } from "@testing-library/react";
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
    expect(screen.getByText(code.slice(0, 4).toUpperCase())).toBeTruthy();

    approved = true;
    await act(async () => { await vi.advanceTimersByTimeAsync(2500); });
    expect(assign).toHaveBeenCalledWith("/dashboard");

    vi.useRealTimers();
    vi.unstubAllGlobals();
    open.mockRestore();
    delete (window.navigator as { standalone?: boolean }).standalone;
  });
});

