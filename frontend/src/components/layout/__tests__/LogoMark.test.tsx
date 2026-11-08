import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LogoMark } from "../LogoMark";

describe("LogoMark", () => {
  it("shows the final mark at the size asked for", () => {
    render(<LogoMark size={36} />);
    const img = screen.getByRole("img", { name: "The Third Eye" });
    expect(img.getAttribute("src")).toContain("logo-mark.png");
    expect(img).toHaveAttribute("width", "36");
  });
});
