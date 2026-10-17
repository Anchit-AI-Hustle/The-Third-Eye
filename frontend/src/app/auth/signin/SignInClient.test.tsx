import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SignInClient } from "./SignInClient";

const signIn = vi.fn();

vi.mock("next-auth/react", () => ({
  signIn: (...a: unknown[]) => signIn(...a),
}));

const fetchMock = vi.fn();

beforeEach(() => {
  signIn.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

function preflight(exists: boolean) {
  fetchMock.mockResolvedValue({ json: async () => ({ ok: true, exists }) });
}

async function reachPin(exists: boolean) {
  preflight(exists);
  render(<SignInClient callbackUrl="/dashboard" initialError={null} />);
  fireEvent.change(screen.getByLabelText("Mobile number"), { target: { value: "9876543210" } });
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  return screen.findByLabelText("4-digit PIN");
}

describe("SignInClient", () => {
  it("offers no Google or other provider, only a number and a PIN", () => {
    render(<SignInClient callbackUrl="/dashboard" initialError={null} />);
    expect(screen.queryByText(/google/i)).toBeNull();
    expect(screen.getByLabelText("Mobile number")).toBeInTheDocument();
  });

  it("asks a known number for its PIN with a 4-digit numeric box", async () => {
    const box = await reachPin(true);
    expect(box).toHaveAttribute("inputmode", "numeric");
    expect(box).toHaveAttribute("maxlength", "4");
    expect(box).toHaveAttribute("autocomplete", "current-password");
    expect(screen.queryByLabelText("Your name")).toBeNull();
    fireEvent.change(box, { target: { value: "12ab345" } });
    expect(box).toHaveValue("1234");
  });

  it("sends the number and PIN to the phone provider", async () => {
    signIn.mockResolvedValue({ ok: false, error: "That PIN is not right. 3 tries left." });
    const box = await reachPin(true);
    fireEvent.change(box, { target: { value: "8305" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() =>
      expect(signIn).toHaveBeenCalledWith("phone", expect.objectContaining({ phone: "9876543210", cc: "+91", pin: "8305", redirect: false })),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("That PIN is not right. 3 tries left.");
  });

  it("asks a new number for a name and a PIN", async () => {
    await reachPin(false);
    expect(screen.getByLabelText("Your name")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create account" })).toBeInTheDocument();
  });

  it("refuses a 3-digit PIN before sending it", async () => {
    const box = await reachPin(true);
    fireEvent.change(box, { target: { value: "123" } });
    expect(screen.getByRole("button", { name: "Sign in" })).toBeDisabled();
    expect(signIn).not.toHaveBeenCalled();
  });
});
