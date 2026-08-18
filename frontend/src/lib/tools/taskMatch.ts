// Finding the task the user meant.
//
// manage_tasks used to require an id for update and delete. Ids are UUIDs, so
// unless the model had just run a search it had none — and the handler answered
// "not found — update queued" while still emitting the side effect. The client
// then applied a patch to an id matching nothing, so nothing changed, and the
// model, told the update was queued, reported it to the user as done.
//
// So: resolve by id, else by what the user actually said — the title. Refuse
// rather than guess when the words match more than one task, and never emit a
// write when nothing matched.

export interface MatchableTask {
  id: string;
  title: string;
  status?: string;
}

export interface TaskMatch {
  task?: MatchableTask;
  message: string;
}

const CLOSED = new Set(["done", "cancelled"]);

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Resolve `{ id?, title? }` to exactly one task. On failure the message is
 * written for the model to relay: it says what went wrong and what to do next,
 * because the alternative is the assistant inventing a confirmation.
 */
export function resolveTask(
  tasks: MatchableTask[],
  input: { id?: string; title?: string },
): TaskMatch {
  if (input.id) {
    const byId = tasks.find((t) => t.id === input.id);
    if (byId) return { task: byId, message: "" };
    // A hallucinated id with a real title is still actionable — fall through.
    if (!input.title) {
      return { message: `No task with id ${input.id} exists. Search the tasks first, then act on one of the ids returned. Do not tell the user it was changed.` };
    }
  }

  const wanted = norm(input.title ?? "");
  if (!wanted) {
    return { message: "No task id or title was given, so there is nothing to act on. Ask the user which task they mean." };
  }

  // Open tasks first: "mark the gym task done" means the one still outstanding,
  // not the one finished last month.
  const open = tasks.filter((t) => !CLOSED.has(String(t.status)));
  for (const pool of [open, tasks]) {
    const exact = pool.filter((t) => norm(t.title) === wanted);
    if (exact.length === 1) return { task: exact[0], message: "" };
    if (exact.length > 1) return { message: ambiguous(exact) };

    const partial = pool.filter((t) => norm(t.title).includes(wanted) || wanted.includes(norm(t.title)));
    if (partial.length === 1) return { task: partial[0], message: "" };
    if (partial.length > 1) return { message: ambiguous(partial) };
  }

  return {
    message: `No task matching "${input.title}" is in the tracker, so nothing was changed. Tell the user it wasn't found — do not claim it was updated or deleted.`,
  };
}

function ambiguous(candidates: MatchableTask[]): string {
  const list = candidates.slice(0, 5).map((t) => `- ${t.title} (id: ${t.id})`).join("\n");
  return `That matches ${candidates.length} tasks, so nothing was changed. Ask the user which one they mean:\n${list}`;
}
