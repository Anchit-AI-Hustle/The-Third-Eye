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
});
