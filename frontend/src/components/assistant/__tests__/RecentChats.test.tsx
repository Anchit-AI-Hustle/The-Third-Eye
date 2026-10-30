import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RecentChats } from "@/components/assistant/RecentChats";
import { settleMessages } from "@/hooks/useChatLibrary";

const now = Date.parse("2026-10-14T10:00:00Z");
const chats = [
  { id: "a", title: "Plan the Manali trip", project_id: null, updated_at: "2026-10-14T09:30:00Z" },
  { id: "b", title: "Draft the Q3 email", project_id: null, updated_at: "2026-10-13T08:00:00Z" },
  { id: "c", title: "Gym routine", project_id: null, updated_at: "2026-10-10T08:00:00Z" },
  { id: "d", title: "Budget", project_id: null, updated_at: "2026-10-09T08:00:00Z" },
  { id: "e", title: "Old one", project_id: null, updated_at: "2026-10-01T08:00:00Z" },
];

describe("past chats on the Assistant's welcome screen", () => {
  it("offers to continue the latest chat and lists the next few", () => {
    const onOpen = vi.fn();
    render(<RecentChats chats={chats} now={now} onOpen={onOpen} onShowAll={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /Continue: Plan the Manali trip/ }));
    expect(onOpen).toHaveBeenCalledWith("a");
    expect(screen.getByText("30m ago")).toBeTruthy();
    for (const t of ["Draft the Q3 email", "Gym routine", "Budget"]) expect(screen.getByText(t)).toBeTruthy();
    expect(screen.queryByText("Old one")).toBeNull();
    fireEvent.click(screen.getByText("Gym routine"));
    expect(onOpen).toHaveBeenLastCalledWith("c");
  });

  it("shows the latest chat's last message", () => {
    render(<RecentChats chats={[{ ...chats[0], preview: "Day 2: Solang valley" }]} now={now} onOpen={() => {}} onShowAll={() => {}} />);
    expect(screen.getByText("Day 2: Solang valley")).toBeTruthy();
  });

  it("links to every chat when there are more", () => {
    const onShowAll = vi.fn();
    render(<RecentChats chats={chats} now={now} onOpen={() => {}} onShowAll={onShowAll} />);
    fireEvent.click(screen.getByRole("button", { name: /All chats \(5\)/ }));
    expect(onShowAll).toHaveBeenCalled();
  });

  it("shows a raw tool call title as plain words", () => {
    const raw = [{ id: "t", title: 'CALL manage_tasks {"action":"create","title":"x"}', project_id: null, updated_at: "2026-10-14T09:00:00Z" }];
    render(<RecentChats chats={raw} now={now} onOpen={() => {}} onShowAll={() => {}} />);
    expect(screen.getByText("Manage tasks")).toBeTruthy();
    expect(screen.queryByText(/CALL/)).toBeNull();
  });

  it("shows nothing before the first chat", () => {
    const { container } = render(<RecentChats chats={[]} now={now} onOpen={() => {}} onShowAll={() => {}} />);
    expect(container.textContent).toBe("");
  });
});

describe("reopening a chat saved mid-reply", () => {
  it("clears the streaming state and drops an empty unfinished reply", () => {
    const out = settleMessages([
      { id: "1", role: "user", content: "hi" },
      { id: "2", role: "assistant", content: "Hello", streaming: true },
      { id: "3", role: "assistant", content: "", streaming: true },
    ]);
    expect(out).toEqual([
      { id: "1", role: "user", content: "hi" },
      { id: "2", role: "assistant", content: "Hello" },
    ]);
  });
});
