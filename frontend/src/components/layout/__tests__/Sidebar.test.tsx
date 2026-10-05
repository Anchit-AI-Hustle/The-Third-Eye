import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Sidebar } from "../Sidebar";

const signOutAndClear = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => "/activity",
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: { user: { name: "Anchit", email: "anchit@example.com" } },
    status: "authenticated",
  }),
}));

vi.mock("@/lib/signOutClean", () => ({
  signOutAndClear: (...args: unknown[]) => signOutAndClear(...args),
}));

vi.mock("@/components/billing/WalletWidget", () => ({
  WalletWidget: () => null,
}));

vi.mock("@/components/PWAInstall", () => ({
  PWAInstall: () => null,
}));

vi.mock("@/components/layout/CloudSyncBadge", () => ({
  CloudSyncBadge: () => null,
}));

describe("Sidebar sign out", () => {
  it("exposes a labeled Sign out control that clears the session", () => {
    render(<Sidebar mobileOpen onMobileClose={() => {}} />);

    const button = screen.getByRole("button", { name: "Sign out" });
    expect(button).toHaveTextContent("Sign out");

    fireEvent.click(button);
    expect(signOutAndClear).toHaveBeenCalledWith({ callbackUrl: "/auth/signin" });
  });

  it("lists Settings under Account & System", () => {
    render(<Sidebar mobileOpen onMobileClose={() => {}} />);
    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute("href", "/settings");
  });
});
