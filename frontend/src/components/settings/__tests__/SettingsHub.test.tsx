import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SettingsHub } from "../SettingsHub";

vi.mock("@/components/settings/SettingsClient", () => ({
  SettingsClient: () => <div>Account body</div>,
}));
vi.mock("@/components/settings/ConnectionsCard", () => ({ ConnectionsCard: () => null }));
vi.mock("@/components/settings/AutomationsCard", () => ({ AutomationsCard: () => null }));
vi.mock("@/components/settings/PermissionsCard", () => ({ PermissionsCard: () => null }));
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
  beforeEach(() => localStorage.clear());

  it("opens Agent config with activation settings", () => {
    render(<SettingsHub user={{ name: "A", email: "a@b.c" }} />);
    expect(screen.getByText("Account body")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Agent config/ }));
    expect(screen.getByText("Assistant activation")).toBeInTheDocument();
    expect(screen.getByText("Profiles")).toBeInTheDocument();
  });
});
