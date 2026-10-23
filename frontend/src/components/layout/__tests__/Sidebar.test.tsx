import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Sidebar } from "../Sidebar";

const signOutAndClear = vi.fn();

let pathname = "/activity";
vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
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

describe("Sidebar sections", () => {
  it("shows every screen at once, grouped, with no More toggle", () => {
    pathname = "/dashboard";
    render(<Sidebar mobileOpen onMobileClose={() => {}} />);
    for (const name of ["Today", "Assistant", "Tasks", "Notes", "Knowledge", "Goals", "Studio", "Apps", "Agent Activity", "Connectors"]) {
      expect(screen.getByRole("link", { name })).toBeInTheDocument();
    }
    expect(screen.getByRole("link", { name: "Studio" })).toHaveAttribute("href", "/tools");
    expect(screen.queryByRole("button", { name: /More/ })).toBeNull();
  });
});
