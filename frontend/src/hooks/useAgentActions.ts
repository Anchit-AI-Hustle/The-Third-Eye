"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { useLocalTasks } from "./useLocalTasks";
import { useLocalGoals } from "./useLocalGoals";
import { useLocalNotes } from "./useLocalNotes";
import { useLocalExpenses } from "./useLocalExpenses";
import { isAgentKilled, logAgentAction, describeSideEffect } from "@/lib/agentControl";
import { isInternalLink } from "@/lib/appLinks";

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
  const { add: addExpense, remove: removeExpense } = useLocalExpenses();
  const router = useRouter();

  // Routes inside this app navigate in place; anything on the web opens in its
  // own tab so the user does not lose the conversation they are having.
  const openResolved = useCallback(
    (url: string) => {
      if (isInternalLink(url)) router.push(url);
      else window.open(url, "_blank");
    },
    [router],
  );

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
      const applyList = async (effects: AgentSideEffect[]): Promise<UndoableAction[]> => {
        const local: UndoableAction[] = [];
        for (const fx of effects) {
          const d = fx.data ?? {};
          switch (fx.type) {
            case "task_create":
              if (d.title) {
                const t = await createTask({
                  title: d.title,
                  priority: d.priority ?? "medium",
                  status: "todo",
                  assignee: d.assignee,
                  agent: d.agent,
                  due_date: d.due_date,
                  description: d.description,
                });
                if (t?.id) local.push({ label: `task "${d.title}"`, undo: () => removeTask(t.id) });
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
                if (n?.id) local.push({ label: `note "${d.title}"`, undo: () => removeNote(n.id) });
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
                if (g?.id) local.push({ label: `goal "${d.title}"`, undo: () => removeGoal(g.id) });
              }
              break;
            case "goal_update":
              if (d.id && d.delta !== undefined) adjustGoal(d.id, d.delta);
              break;
            case "goal_delete":
              if (d.id) removeGoal(d.id);
              break;
            case "expense_create":
              if (typeof d.amount === "number" && d.amount > 0) {
                const ex = await addExpense({
                  amount: d.amount,
                  category: d.category ?? "Other",
                  note: d.note,
                  gst_rate: typeof d.gst_rate === "number" ? d.gst_rate : undefined,
                  spent_on: d.spent_on,
                });
                if (ex?.id) local.push({ label: `expense ₹${d.amount}`, undo: () => removeExpense(ex.id) });
              }
              break;
            case "expense_delete":
              if (d.id) removeExpense(d.id);
              break;
            case "open_url":
              if (d.url) openResolved(d.url);
              break;
            case "open_urls":
              if (Array.isArray(d.data)) {
                for (const item of d.data) {
                  const url = item?.data?.url ?? item?.url;
                  if (url) openResolved(url);
                }
              }
              break;
            case "device_action":
              if (d.action) {
                const { executeDeviceAction } = await import("@/lib/deviceControl");
                await executeDeviceAction({
                  action: String(d.action),
                  device: String(d.device ?? "phone"),
                  value: d.value == null ? null : String(d.value),
                });
              }
              break;
            case "home_action":
              if (d.action) {
                const { executeHomeAction } = await import("@/lib/deviceControl");
                executeHomeAction({
                  action: String(d.action),
                  device: String(d.device ?? "home"),
                  value: d.value == null ? null : String(d.value),
                });
              }
              break;
            case "batch":
              if (Array.isArray(d)) {
                local.push(...(await applyList(d as AgentSideEffect[])));
              } else if (Array.isArray(d.items)) {
                local.push(...(await applyList(d.items as AgentSideEffect[])));
              }
              break;
            default:
              break;
          }
          logAgentAction({ type: fx.type, label: describeSideEffect(fx.type, d), outcome: "applied" });
        }
        return local;
      };
      undoables.push(...(await applyList(sideEffects)));
      return undoables;
    },
    [createTask, updateTask, removeTask, createNote, removeNote, addGoal, adjustGoal, removeGoal, addExpense, removeExpense, openResolved],
  );
}
