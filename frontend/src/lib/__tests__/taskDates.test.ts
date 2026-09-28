import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { isDueSoon, isOverdue } from "@/lib/taskDates";

// Fixed "now" so the three-day window has stable edges; a real clock makes
// these assertions drift into flakes overnight.
const NOW = new Date("2026-09-28T12:00:00Z");
const at = (days: number) => new Date(NOW.getTime() + days * 86400000).toISOString().slice(0, 10);

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOW); });
afterEach(() => vi.useRealTimers());

describe("isOverdue", () => {
  it("is false for a task due today, so nothing is late on the day it is due", () => {
    expect(isOverdue(at(0), "todo")).toBe(false);
  });

  it("is true once the due date has passed", () => {
    expect(isOverdue(at(-1), "todo")).toBe(true);
  });

  it("never marks a closed task late, however long ago it was due", () => {
    expect(isOverdue(at(-30), "done")).toBe(false);
    expect(isOverdue(at(-30), "cancelled")).toBe(false);
  });

  it("treats a missing or unparseable date as not overdue rather than as 1970", () => {
    expect(isOverdue(undefined, "todo")).toBe(false);
    expect(isOverdue("not a date", "todo")).toBe(false);
  });
});

describe("isDueSoon", () => {
  it("flags a task inside the three-day window", () => {
    expect(isDueSoon(at(1), "todo")).toBe(true);
    expect(isDueSoon(at(2), "todo")).toBe(true);
  });

  it("does not flag one beyond the window", () => {
    expect(isDueSoon(at(5), "todo")).toBe(false);
  });

  it("yields to overdue, so a late task is never softened to a warning", () => {
    expect(isOverdue(at(-2), "todo")).toBe(true);
    expect(isDueSoon(at(-2), "todo")).toBe(false);
  });

  it("stays quiet for closed tasks and unusable dates", () => {
    expect(isDueSoon(at(1), "done")).toBe(false);
    expect(isDueSoon(at(1), "cancelled")).toBe(false);
    expect(isDueSoon(undefined, "todo")).toBe(false);
    expect(isDueSoon("not a date", "todo")).toBe(false);
  });

  it("is quiet for a task in review as much as one to do — review is still open work", () => {
    expect(isDueSoon(at(1), "review")).toBe(true);
    expect(isOverdue(at(-1), "review")).toBe(true);
  });
});
