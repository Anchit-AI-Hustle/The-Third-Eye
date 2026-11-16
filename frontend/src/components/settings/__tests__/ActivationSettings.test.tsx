import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ActivationSettings } from "../ActivationSettings";

vi.mock("@/hooks/useJarvisTriggers", () => ({
  maybeRequestShake: vi.fn(),
}));

describe("ActivationSettings", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("renders wake, gesture, and hotkey sections", () => {
    render(<ActivationSettings />);
    expect(screen.getByText("Voice activation")).toBeInTheDocument();
    expect(screen.getByText("Gesture activation")).toBeInTheDocument();
    expect(screen.getByText("Keyboard shortcut")).toBeInTheDocument();
    expect(screen.getByText("“Hey Jarvis”")).toBeInTheDocument();
    expect(screen.getByText("Device Shake")).toBeInTheDocument();
  });

  it("separates wake-only setup from ambient Life Log recording", () => {
    render(<ActivationSettings />);
    expect(screen.getByText(/Open these settings on the HTTPS website/)).toBeInTheDocument();
    expect(screen.queryByText(/curl -fsSL/)).not.toBeInTheDocument();
    expect(screen.getByText(/Optional Life Log is separate/)).toBeInTheDocument();
    expect(screen.getByText(/Create separate Life Log setup/)).toBeInTheDocument();
    expect(screen.queryByText("Set up this computer")).not.toBeInTheDocument();
  });

  it("persists turning the wake word off", () => {
    render(<ActivationSettings />);
    const switches = screen.getAllByRole("switch");
    fireEvent.click(switches[0]);
    expect(JSON.parse(localStorage.getItem("jarvis_activation_config")!).wakeWordEnabled).toBe(false);
    expect(screen.getByText("Saved")).toBeInTheDocument();
  });
});
