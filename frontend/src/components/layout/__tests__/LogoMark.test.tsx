import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LogoMark } from "../LogoMark";

describe("LogoMark", () => {
  it("gives each copy its own gradient, so two marks on one page both paint", () => {
    const { container } = render(<><LogoMark size={22} /><LogoMark size={36} /></>);
    const ids = Array.from(container.querySelectorAll("linearGradient"), (g) => g.id);
    expect(new Set(ids).size).toBe(2);
    container.querySelectorAll("svg").forEach((svg) => {
      const id = svg.querySelector("linearGradient")!.id;
      expect(svg.querySelector("circle")!.parentElement!.getAttribute("stroke")).toBe(`url(#${id})`);
    });
    expect(screen.getAllByRole("img", { name: "The Third Eye" })).toHaveLength(2);
  });
});
