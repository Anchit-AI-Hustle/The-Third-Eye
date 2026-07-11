"use client";

import { useCallback } from "react";
import { useLocalTasks } from "./useLocalTasks";
import { useLocalGoals } from "./useLocalGoals";
import { useLocalNotes } from "./useLocalNotes";

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
export function useAgentActions() {
  const { create: createTask, update: updateTask, remove: removeTask } = useLocalTasks();
  const { add: addGoal, adjust: adjustGoal, remove: removeGoal } = useLocalGoals();
  const { create: createNote, remove: removeNote } = useLocalNotes();

  return useCallback(
    (sideEffects: AgentSideEffect[] | undefined) => {
      if (!sideEffects?.length) return;
      for (const fx of sideEffects) {
        const d = fx.data ?? {};
        switch (fx.type) {
          case "task_create":
            if (d.title) {
              createTask({
                title: d.title,
                priority: d.priority ?? "medium",
                status: "todo",
                assignee: d.assignee,
                due_date: d.due_date,
                description: d.description,
              });
            }
            break;
          case "task_update":
            if (d.id) updateTask(d.id, d.patch ?? {});
            break;
          case "task_delete":
            if (d.id) removeTask(d.id);
            break;
          case "note_create":
            if (d.title) createNote(d.title, d.content ?? "");
            break;
          case "note_delete":
            if (d.id) removeNote(d.id);
            break;
          case "goal_create":
            if (d.title) {
              addGoal({
                title: d.title,
                category: d.category ?? "Personal",
                target: d.target ?? 100,
                current: d.current ?? 0,
                unit: d.unit ?? "%",
                deadline: d.deadline,
                description: d.description,
              });
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
      }
    },
    [createTask, updateTask, removeTask, createNote, removeNote, addGoal, adjustGoal, removeGoal],
  );
}
