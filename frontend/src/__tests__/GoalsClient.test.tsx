import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { GoalsClient } from "@/components/goals/GoalsClient";

vi.mock("@/hooks/useLocalGoals", () => ({
  useLocalGoals: () => ({
    goals: [],
    ready: true,
    add: vi.fn(),
    adjust: vi.fn(),
    remove: vi.fn(),
  }),
}));

describe("GoalsClient", () => {
  it("renders empty state when no goals exist", () => {
    render(<GoalsClient />);
    expect(screen.getByText("No goals yet. Create your first one above.")).toBeTruthy();
  });

  it("renders the New Goal button", () => {
    render(<GoalsClient />);
    expect(screen.getByText("New Goal")).toBeTruthy();
  });

  it("renders stats with zero counts", () => {
    render(<GoalsClient />);
    expect(screen.getByText("Total goals")).toBeTruthy();
    expect(screen.getByText("Completed")).toBeTruthy();
    expect(screen.getByText("In progress")).toBeTruthy();
  });
});
