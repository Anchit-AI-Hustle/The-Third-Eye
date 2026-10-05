import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
    const submit = vi.spyOn(HTMLFormElement.prototype, "submit").mockImplementation(() => {});
    const { container } = render(<SignInClient callbackUrl="/dashboard" initialError={null} />);
    const form = container.querySelector("form");
    expect(form?.getAttribute("method")).toBe("post");
    expect(form?.getAttribute("action")).toBe("/api/auth/signin/google");
    expect(container.querySelector("input[name=json]")).toBeNull();
    expect(container.querySelector("input[name=callbackUrl]")?.getAttribute("value")).toBe("/dashboard");

    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    expect(getCsrfToken).toHaveBeenCalledTimes(1);
    expect(container.querySelector("input[name=csrfToken]")?.getAttribute("value")).toBe("csrf-test");
    submit.mockRestore();
  });

  it("shows the Google error that brought the browser back", () => {
    render(<SignInClient callbackUrl="/dashboard" initialError="OAuthCallback" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Google didn't finish");
    expect(screen.getByRole("alert")).toHaveTextContent("OAuthCallback");
  });
});
