import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next-auth/react", () => ({ getCsrfToken: vi.fn(async () => "tok") }));
const submit = vi.spyOn(HTMLFormElement.prototype, "submit").mockImplementation(() => {});
const { default: AppSignIn } = await import("@/app/auth/app/page");

describe("/auth/app", () => {
  it("goes straight to Google and comes back to the app hand-off", async () => {
    const { container } = render(<AppSignIn />);
    await waitFor(() => expect(submit).toHaveBeenCalled());
    const form = container.querySelector("form")!;
    expect(form.getAttribute("action")).toBe("/api/auth/signin/google");
    expect((form.elements.namedItem("csrfToken") as HTMLInputElement).value).toBe("tok");
    expect((form.elements.namedItem("callbackUrl") as HTMLInputElement).value).toBe("/api/app-signin");
    expect(screen.getByText(/Opening Google/)).toBeInTheDocument();
  });

  it("carries the app's sign-in state through Google", async () => {
    window.history.replaceState(null, "", "/auth/app?state=Zq8_xY-3kLm9Pq2RsT4uVw");
    submit.mockClear();
    const { container } = render(<AppSignIn />);
    await waitFor(() => expect(submit).toHaveBeenCalled());
    expect((container.querySelector("form")!.elements.namedItem("callbackUrl") as HTMLInputElement).value).toBe("/api/app-signin?state=Zq8_xY-3kLm9Pq2RsT4uVw");
    window.history.replaceState(null, "", "/");
  });
});
