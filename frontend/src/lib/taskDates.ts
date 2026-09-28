import type { TaskStatus } from "@/hooks/useLocalTasks";

// Deadline colouring for the Task Tracker, kept out of the component so the
// boundaries are testable: an off-by-one here mislabels a task as late in
// front of whoever owns it.

/** Past its due date, and still open. A closed task is never late. */
export function isOverdue(due?: string, status?: TaskStatus): boolean {
  if (!due || status === "done" || status === "cancelled") return false;
  const t = new Date(due).getTime();
  if (Number.isNaN(t)) return false;
  // Compared against the start of today, so a task due today is not yet late.
  return t < new Date(new Date().toDateString()).getTime();
}

/**
 * Due inside three days — the same window the Personal AI OS board uses.
 * Overdue wins where both would apply, so a late task never softens into a
 * warning.
 */
export function isDueSoon(due?: string, status?: TaskStatus): boolean {
  if (!due || status === "done" || status === "cancelled") return false;
  if (isOverdue(due, status)) return false;
  const t = new Date(due).getTime();
  return !Number.isNaN(t) && t - Date.now() < 3 * 86400000;
}
