import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ChecklistCard } from "@/components/assistant/ChecklistCard";

describe("ChecklistCard", () => {
  it("shows progress, each step's state, and the evidence behind a tick", () => {
    render(
      <ChecklistCard steps={[
        { id: 1, title: "Create the event", verify: "listed", needsTool: true, status: "done", evidence: "events.list shows it Fri 3pm" },
        { id: 2, title: "Email the invite", verify: "in Sent", needsTool: true, status: "awaiting" },
        { id: 3, title: "Book the room", verify: "booked", needsTool: true, status: "failed", note: "No rooms free" },
        { id: 4, title: "Tell the user", verify: "reply", needsTool: false, status: "pending" },
      ]} />,
    );
    expect(screen.getByText("1/4 verified")).toBeTruthy();
    expect(screen.getByText("✓ events.list shows it Fri 3pm")).toBeTruthy();
    expect(screen.getByText("needs your Confirm")).toBeTruthy();
    expect(screen.getByText("No rooms free")).toBeTruthy();
    expect(screen.getByText("to do")).toBeTruthy();
  });
});
