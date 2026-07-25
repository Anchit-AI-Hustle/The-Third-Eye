"use client";

import { useCallback } from "react";
import { useLocalTasks } from "./useLocalTasks";
import { useLocalGoals } from "./useLocalGoals";
import { useLocalNotes } from "./useLocalNotes";
import { isAgentKilled, logAgentAction, describeSideEffect } from "@/lib/agentControl";

// A side-effect emitted by the /api/chat agent loop when it runs a write tool.
export interface AgentSideEffect {
  type: string;
  data?: Record<string, any>;
}

/**
 * Single source of truth for applying the assistant's actions to the user's
 * data. Both the full-page assistant and the floating VoiceOverlay use this so
 * the agent has identical powers everywhere — and so writes go through the
 * real hooks (Supabase-backed when signed in) instead of drifting per-caller.
 *
 * Returns an `apply(sideEffects)` function; call it with `parsed.sideEffects`
 * from the chat stream's `done` event.
 */
// An action the user can reverse right after the agent applies it.
export interface UndoableAction {
  label: string;
  undo: () => void;
}

export function useAgentActions() {
  const { create: createTask, update: updateTask, remove: removeTask } = useLocalTasks();
  const { add: addGoal, adjust: adjustGoal, remove: removeGoal } = useLocalGoals();
  const { create: createNote, remove: removeNote } = useLocalNotes();

  // Returns the list of undoable actions applied (created items), so the caller
  // can offer a short-lived "Undo" — the agent's writes are no longer one-way.
  return useCallback(
    async (sideEffects: AgentSideEffect[] | undefined): Promise<UndoableAction[]> => {
      if (!sideEffects?.length) return [];
      // Kill switch (spec §6/§11): when engaged, the agent applies NOTHING —
      // every requested action is logged as blocked and skipped.
      if (isAgentKilled()) {
        for (const fx of sideEffects) {
          logAgentAction({ type: fx.type, label: describeSideEffect(fx.type, fx.data), outcome: "blocked" });
        }
        return [];
      }
      const undoables: UndoableAction[] = [];
      for (const fx of sideEffects) {
        const d = fx.data ?? {};
        switch (fx.type) {
          case "task_create":
            if (d.title) {
              const t = await createTask({
                title: d.title,
                priority: d.priority ?? "medium",
                status: "todo",
                assignee: d.assignee,
                due_date: d.due_date,
                description: d.description,
              });
              if (t?.id) undoables.push({ label: `task "${d.title}"`, undo: () => removeTask(t.id) });
            }
            break;
          case "task_update":
            if (d.id) updateTask(d.id, d.patch ?? {});
            break;
          case "task_delete":
            if (d.id) removeTask(d.id);
            break;
          case "note_create":
            if (d.title) {
              const n = await createNote(d.title, d.content ?? "");
              if (n?.id) undoables.push({ label: `note "${d.title}"`, undo: () => removeNote(n.id) });
            }
            break;
          case "note_delete":
            if (d.id) removeNote(d.id);
            break;
          case "goal_create":
            if (d.title) {
              const g = await addGoal({
                title: d.title,
                category: d.category ?? "Personal",
                target: d.target ?? 100,
                current: d.current ?? 0,
                unit: d.unit ?? "%",
                deadline: d.deadline,
                description: d.description,
              });
              if (g?.id) undoables.push({ label: `goal "${d.title}"`, undo: () => removeGoal(g.id) });
            }
            break;
          case "goal_update":
            if (d.id && d.delta !== undefined) adjustGoal(d.id, d.delta);
            break;
          case "goal_delete":
            if (d.id) removeGoal(d.id);
            break;
          // memory_update is handled server-side; nothing to apply on the client.
          default:
            break;
        }
        // Append-only audit trail of everything the agent applied.
        logAgentAction({ type: fx.type, label: describeSideEffect(fx.type, d), outcome: "applied" });
      }
      return undoables;
    },
    [createTask, updateTask, removeTask, createNote, removeNote, addGoal, adjustGoal, removeGoal],
  );
}
