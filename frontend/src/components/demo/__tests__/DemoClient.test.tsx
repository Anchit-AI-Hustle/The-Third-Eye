import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEMO_DELAY_MS, DemoClient } from "../DemoClient";

const fetchSpy = vi.fn();

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("fetch", fetchSpy);
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  fetchSpy.mockClear();
});

const wait = () => act(() => vi.advanceTimersByTime(DEMO_DELAY_MS));
const click = (name: string | RegExp) => fireEvent.click(screen.getByRole("button", { name }));

describe("DemoClient", () => {
  it("runs inbox → ask → capture → workspace on sample data without any network call", () => {
    render(<DemoClient />);

    click("Scan the sample inbox");
    wait();
    expect(screen.getByText("3 tasks added to your demo workspace")).toBeInTheDocument();

    click(/Next: Ask/);
    click("What's due this week?");
    wait();
    expect(screen.getByText(/You have 3 open tasks/)).toBeInTheDocument();

    click("What does clause 7 of the Northwind contract say?");
    wait();
    expect(screen.getByText(/Northwind_Services_Agreement\.pdf · §7/)).toBeInTheDocument();

    click("Draft a reply to Priya confirming Thursday");
    wait();
    click("Confirm & do it");
    wait();
    expect(screen.getByText(/Demo only - nothing was sent/)).toBeInTheDocument();

    click(/Next: Capture/);
    click("Read this photo");
    wait();
    expect(screen.getByText("Launch plan (whiteboard)")).toBeInTheDocument();

    click(/Next: Workspace/);
    expect(screen.getByText("Tasks (5 open)")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: /Dentist check-up/ }));
    expect(screen.getByText("Tasks (4 open)")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem").some((li) => li.textContent?.includes("Sent email to Priya Shah"))).toBe(true);

    click(/Start the demo over/);
    expect(screen.getByRole("button", { name: "Scan the sample inbox" })).toBeInTheDocument();

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("answers from the current task list, so an empty workspace says so", () => {
    render(<DemoClient />);
    click("2 Ask");
    click("What's due this week?");
    wait();
    expect(screen.getByText(/Nothing is tracked yet/)).toBeInTheDocument();
  });
});
