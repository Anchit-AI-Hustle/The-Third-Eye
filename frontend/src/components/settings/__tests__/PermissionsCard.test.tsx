import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PermissionsCard, openDeviceAppSettings } from "../PermissionsCard";
import * as consent from "@/lib/consent";

describe("PermissionsCard & Device App Settings", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("renders Phone App Settings header and platform guide", () => {
    render(<PermissionsCard />);
    expect(screen.getByText("Phone App Settings & Device Access")).toBeInTheDocument();
    expect(screen.getAllByText(/iOS: Settings → JARVIS OS/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Android: Settings → Apps → JARVIS OS → Permissions/).length).toBeGreaterThan(0);
  });

  it("renders categorized permissions for Documents, Camera, Location, Contacts, Audio, etc.", () => {
    render(<PermissionsCard />);
    // Categories
    expect(screen.getByText("Documents, Files & Media Vault")).toBeInTheDocument();
    expect(screen.getByText("Camera & Optical Vision")).toBeInTheDocument();
    expect(screen.getByText("Location & Spatial Navigation")).toBeInTheDocument();
    expect(screen.getByText("Microphone & Voice Intelligence")).toBeInTheDocument();
    expect(screen.getByText("Contacts & Direct Outreach")).toBeInTheDocument();
    expect(screen.getByText("Hardware & Physical Controls")).toBeInTheDocument();

    // Specific capability labels
    expect(screen.getByText("Documents & Files")).toBeInTheDocument();
    expect(screen.getByText("Photos & Media")).toBeInTheDocument();
    expect(screen.getByText("Camera & Vision")).toBeInTheDocument();
    expect(screen.getByText("Location & Spatial")).toBeInTheDocument();
    expect(screen.getByText("Contacts & People")).toBeInTheDocument();
    expect(screen.getByText("Microphone & Voice")).toBeInTheDocument();
  });

  it("allows switching in-app policy between Always and Ask", () => {
    render(<PermissionsCard />);
    const alwaysButtons = screen.getAllByRole("button", { name: "Always" });
    expect(alwaysButtons.length).toBeGreaterThan(0);

    // Click the first "Always" button
    fireEvent.click(alwaysButtons[0]);
    // Policy should now be recorded
    expect(localStorage.length).toBeGreaterThan(0);
  });

  it("triggers openDeviceAppSettings when clicking Open Phone Device Settings", async () => {
    render(<PermissionsCard />);
    const openBtn = screen.getByRole("button", { name: /Open Phone Device Settings/i });
    expect(openBtn).toBeInTheDocument();

    fireEvent.click(openBtn);

    // On standard web environment, desktop help banner is surfaced
    await waitFor(() => {
      expect(screen.getByText("Device App Settings Guide")).toBeInTheDocument();
    });

    // Dismiss banner
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByText("Device App Settings Guide")).not.toBeInTheDocument();
  });

  it("executes Test Access without crashing", async () => {
    render(<PermissionsCard />);
    const testBtns = screen.getAllByRole("button", { name: /Test Access/i });
    expect(testBtns.length).toBeGreaterThan(0);

    // Click test on the first item (documents/files)
    fireEvent.click(testBtns[0]);
    // Should show success or feedback message
    await waitFor(() => {
      expect(screen.getAllByText(/picker launched|verified|active/i).length).toBeGreaterThan(0);
    });
  });

  it("openDeviceAppSettings calls Capacitor plugin when available", async () => {
    const mockOpenSettings = vi.fn().mockResolvedValue(true);
    (window as any).Capacitor = {
      Plugins: {
        App: {
          openSettings: mockOpenSettings,
        },
      },
    };

    const res = await openDeviceAppSettings();
    expect(res.opened).toBe(true);
    expect(res.platform).toBe("capacitor");
    expect(mockOpenSettings).toHaveBeenCalled();

    delete (window as any).Capacitor;
  });
});
