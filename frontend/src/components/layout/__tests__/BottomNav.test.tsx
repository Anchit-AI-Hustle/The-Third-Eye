import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/tasks" }));
import { BottomNav } from "@/components/layout/BottomNav";

describe("phone tab bar", () => {
  it("shows the four everyday screens and a More button that opens the full menu", () => {
    const onMore = vi.fn();
    render(<BottomNav onMore={onMore} />);
    expect(screen.getAllByRole("link").map((a) => a.getAttribute("aria-label"))).toEqual(["Today", "Assistant", "Tasks", "Notes"]);
    expect(screen.getByRole("link", { name: "Tasks" })).toHaveAttribute("aria-current", "page");
    fireEvent.click(screen.getByRole("button", { name: "More" }));
    expect(onMore).toHaveBeenCalled();
  });
});
