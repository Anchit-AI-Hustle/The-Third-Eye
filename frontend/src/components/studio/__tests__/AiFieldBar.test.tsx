import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AiFieldBar } from "@/components/studio/AiFieldBar";

afterEach(() => vi.unstubAllGlobals());

describe("AiFieldBar", () => {
  it("sends the field and the rest of the form, and applies the suggestion", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ suggestion: "Kyoto" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const onChange = vi.fn();
    render(<AiFieldBar tool={{ label: "Trip Planner" }} field={{ name: "destination", label: "Destination", type: "text" }}
      value="" context={{ Budget: "Luxury" }} onChange={onChange} />);

    fireEvent.click(screen.getByText("Suggest").previousSibling as HTMLElement);
    await waitFor(() => expect(onChange).toHaveBeenCalledWith("Kyoto"));
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toMatchObject({ action: "suggest", field: { name: "destination" }, context: { Budget: "Luxury" } });
  });

  it("can't enhance an empty field, and Clear resets to the field's default", () => {
    const onChange = vi.fn();
    render(<AiFieldBar tool={{ label: "Trip Planner" }} field={{ name: "budget", label: "Budget", type: "select", options: ["Mid-range", "Luxury"] }}
      value="" context={{}} onChange={onChange} clearTo="Mid-range" />);
    expect((screen.getByText("Enhance").previousSibling as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByText("Clear").previousSibling as HTMLElement);
    expect(onChange).toHaveBeenCalledWith("Mid-range");
  });

  it("keeps what was typed while the suggestion was on its way", async () => {
    let resolve!: (r: Response) => void;
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise<Response>((r) => { resolve = r; })));
    const onChange = vi.fn();
    const field = { name: "a", label: "A", type: "text" as const };
    const { rerender } = render(<AiFieldBar tool={{ label: "X" }} field={field} value="draft" context={{}} onChange={onChange} />);
    fireEvent.click(screen.getByText("Enhance").previousSibling as HTMLElement);
    rerender(<AiFieldBar tool={{ label: "X" }} field={field} value="draft, then a lot more typing" context={{}} onChange={onChange} />);
    resolve(new Response(JSON.stringify({ suggestion: "polished draft" }), { status: 200 }));
    expect(await screen.findByText(/kept your edit/)).toBeTruthy();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("shows why a suggestion failed", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "No usable suggestion came back — try again." }), { status: 502 })));
    render(<AiFieldBar tool={{ label: "X" }} field={{ name: "a", label: "A", type: "text" }} value="" context={{}} onChange={vi.fn()} />);
    fireEvent.click(screen.getByText("New").previousSibling as HTMLElement);
    expect(await screen.findByText(/No usable suggestion/)).toBeTruthy();
  });
});
