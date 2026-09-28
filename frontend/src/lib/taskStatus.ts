import type { TaskStatus } from "@/hooks/useLocalTasks";

// One list of task statuses and their labels.
//
// There were two. The tracker had its own, and the dashboard rendered
// `status === "in_progress" ? "In Progress" : "To Do"` — so adding a status
// anywhere else silently mislabelled it there as "To Do". A task sitting in
// review read on the dashboard as untouched, which is the opposite of what it
// means. Anything that shows a status reads it from here.

export const TASK_STATUSES: { value: TaskStatus; label: string }[] = [
  { value: "todo", label: "To Do" },
  { value: "in_progress", label: "In Progress" },
  { value: "review", label: "In Review" },
  { value: "done", label: "Done" },
  { value: "cancelled", label: "Cancelled" },
];

const LABEL = Object.fromEntries(TASK_STATUSES.map((s) => [s.value, s.label])) as Record<TaskStatus, string>;

/** The human label for a status, falling back to "To Do" for an unknown value. */
export function taskStatusLabel(status?: string): string {
  return LABEL[(status ?? "") as TaskStatus] ?? "To Do";
}
