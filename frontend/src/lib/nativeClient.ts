// The chat route hands record changes (task_create, note_delete...) back as side
// effects, and the website writes them so it can offer undo and work without a
// database. The native apps (ios-native, android-native) ask the route to write
// them instead, so nothing the assistant makes there is lost.

import type { Db } from "@/lib/db";

type Row = Record<string, any>;
export type Effect = { type: string; data: any };
export type Applied = { type: string; ok: boolean };

const clean = (o: Row) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== ""));

/** Writes the assistant's record changes for the signed-in person. Anything else is left to the app. */
export async function applyEffects(db: Db, email: string, effects: Effect[]): Promise<Applied[]> {
  const out: Applied[] = [];
  const now = new Date().toISOString();
  const run = async (type: string, op: () => PromiseLike<{ error: unknown }>) => {
    const { error } = await op();
    out.push({ type, ok: !error });
  };
  for (const { type, data: d = {} } of effects) {
    switch (type) {
      case "task_create":
        if (d.title) await run(type, () => db.from("tasks").insert(clean({
          id: crypto.randomUUID(), user_id: email, title: d.title, priority: d.priority ?? "medium", status: "todo",
          assignee: d.assignee, agent: d.agent, due_date: d.due_date, description: d.description, created_at: now, updated_at: now,
        })));
        break;
      case "task_update":
        if (d.id && d.patch) {
          const { user_id: _u, id: _i, ...patch } = d.patch;
          await run(type, () => db.from("tasks").update({ ...patch, updated_at: now }).eq("id", d.id).eq("user_id", email));
        }
        break;
      case "note_create":
        if (d.title || d.content) await run(type, () => db.from("notes").insert({
          id: crypto.randomUUID(), user_id: email, title: d.title ?? "", content: d.content ?? "", pinned: false, created_at: now, updated_at: now,
        }));
        break;
      case "goal_create":
        if (d.title) await run(type, () => db.from("goals").insert(clean({
          id: crypto.randomUUID(), user_id: email, title: d.title, category: d.category ?? "Personal", target: d.target ?? 100,
          current: d.current ?? 0, unit: d.unit ?? "%", deadline: d.deadline, description: d.description, created_at: now,
        })));
        break;
      case "goal_update":
        if (d.id) {
          const { data: g } = await db.from("goals").select("current").eq("id", d.id).eq("user_id", email).maybeSingle();
          if (!g) { out.push({ type, ok: false }); break; }
          const current = typeof d.set_to === "number" ? d.set_to : Number((g as Row).current ?? 0) + Number(d.delta ?? 0);
          await run(type, () => db.from("goals").update({ current }).eq("id", d.id).eq("user_id", email));
        }
        break;
      case "expense_create":
        if (typeof d.amount === "number" && d.amount > 0) await run(type, () => db.from("expenses").insert(clean({
          id: crypto.randomUUID(), user_id: email, amount: d.amount, category: d.category ?? "Other", note: d.note,
          gst_rate: d.gst_rate, spent_on: d.spent_on, created_at: now,
        })));
        break;
      case "task_delete":
      case "note_delete":
      case "goal_delete":
      case "expense_delete":
        if (d.id) {
          const table = { task_delete: "tasks", note_delete: "notes", goal_delete: "goals", expense_delete: "expenses" }[type]!;
          await run(type, () => db.from(table).delete().eq("id", d.id).eq("user_id", email));
        }
        break;
    }
  }
  return out;
}
