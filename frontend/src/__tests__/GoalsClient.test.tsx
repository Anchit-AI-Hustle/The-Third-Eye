import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
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
    const { container } = render(<GoalsClient />);
    expect(container.textContent).toContain("No goals yet");
  });

  it("renders the New Goal button", () => {
    const { container } = render(<GoalsClient />);
    expect(container.textContent).toContain("New Goal");
  });

  it("renders stats with zero counts", () => {
    const { container } = render(<GoalsClient />);
    expect(container.textContent).toContain("Total goals");
    expect(container.textContent).toContain("Completed");
    expect(container.textContent).toContain("In progress");
  });
});
