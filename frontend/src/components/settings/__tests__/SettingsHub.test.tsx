import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SettingsHub } from "../SettingsHub";

let query = "";
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(query) }));

vi.mock("@/components/settings/SettingsClient", () => ({
  SettingsClient: () => <div>Account body</div>,
}));
vi.mock("@/components/settings/ConnectionsCard", () => ({ ConnectionsCard: () => null }));
vi.mock("@/components/settings/WhatsAppCard", () => ({ WhatsAppCard: () => null }));
vi.mock("@/components/settings/DeviceSyncCard", () => ({ DeviceSyncCard: () => null }));
vi.mock("@/components/settings/AutomationsCard", () => ({ AutomationsCard: () => null }));
vi.mock("@/components/settings/PermissionsCard", () => ({ PermissionsCard: () => <div>Device permissions</div> }));
vi.mock("@/components/settings/AgentProfileManager", () => ({
  AgentProfileManager: () => <div>Profiles</div>,
}));
vi.mock("@/hooks/useJarvisTriggers", () => ({ maybeRequestShake: vi.fn() }));
vi.mock("@/hooks/useAgentProfile", () => ({
  useAgentProfile: () => ({
    profiles: [],
    active: { id: "jarvis", name: "JARVIS", gender: "male", greeting: "Hi", avatar: "reactor", accentColor: "#4FC3F7", personality: "", voicePreference: "" },
    switchAgent: vi.fn(),
    createProfile: vi.fn(),
    updateProfile: vi.fn(),
    deleteProfile: vi.fn(),
  }),
  QUALITY_CONTRACT: "",
}));

describe("SettingsHub", () => {
  beforeEach(() => { localStorage.clear(); query = ""; });

  it("opens the tab the menu link names, and follows it when the link changes", () => {
    query = "tab=account";
    const { rerender } = render(<SettingsHub user={{ name: "A", email: "a@b.c" }} />);
    expect(screen.getByText("Account body")).toBeInTheDocument();
    query = "tab=device";
    rerender(<SettingsHub user={{ name: "A", email: "a@b.c" }} />);
    expect(screen.getByText("Device permissions")).toBeInTheDocument();
  });

  it("opens Account & Connections when returning from a connect flow, so its result banner is visible", () => {
    // /api/connect/* redirect to /settings?connect=<result>. The banner lives in
    // ConnectionsCard on the Account tab; landing on Device hid it, which read as
    // "Connect Google loops back to Settings" to Google's reviewers.
    for (const r of ["google_pending", "google_error", "google_connected", "github_error"]) {
      query = `connect=${r}`;
      const { unmount } = render(<SettingsHub user={{ name: "A", email: "a@b.c" }} />);
      expect(screen.getByText("Account body")).toBeInTheDocument();
      unmount();
    }
  });

  it("an explicit tab still wins over a connect result", () => {
    query = "tab=agent&connect=google_error";
    render(<SettingsHub user={{ name: "A", email: "a@b.c" }} />);
    expect(screen.getByText("Profiles")).toBeInTheDocument();
  });

  it("opens Device & App Settings by default and allows switching tabs", () => {
    render(<SettingsHub user={{ name: "A", email: "a@b.c" }} />);
    expect(screen.getByText("Device permissions")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Account & Connections/i }));
    expect(screen.getByText("Account body")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Agent Config/i }));
    expect(screen.getByText("Assistant activation")).toBeInTheDocument();
    expect(screen.getByText("Profiles")).toBeInTheDocument();
  });
});
