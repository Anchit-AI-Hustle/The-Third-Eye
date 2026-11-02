import { directTurn, type DirectTurn } from "@/lib/liveActions";

type OpenTurn = Extract<DirectTurn, { kind: "open" }>;

// Routines are the user's own shortcuts: a name and the steps it stands for,
// kept in durable memory under `routine:<name>`. Saying the name runs it.
// Steps the app can do on its own (open a page or app, connect an account)
// run instantly with no model involved; anything else goes to the assistant
// with the steps spelled out, so it is never guessed.

export const ROUTINE_PREFIX = "routine:";

export interface Routine { name: string; steps: string[] }

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();

const TRIGGER =
  /^(?:(?:hey|hi|ok|okay)\s+)?(?:jarvis\s+)?(?:please\s+)?(?:(?:run|start|do|activate|begin|launch|trigger)\s+)?(?:my\s+|the\s+)?(.+?)(?:\s+(?:routine|shortcut))?(?:\s+please)?$/;

export function readRoutines(store: Record<string, string>): Routine[] {
  return Object.entries(store)
    .filter(([k]) => k.startsWith(ROUTINE_PREFIX))
    .map(([, v]) => {
      try {
        const r = JSON.parse(v) as Routine;
        return typeof r?.name === "string" && Array.isArray(r.steps) ? { name: r.name, steps: r.steps.map(String) } : null;
      } catch { return null; }
    })
    .filter((r): r is Routine => !!r)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function saveRoutine(store: Record<string, string>, name: string, steps: string[]): string {
  const clean = steps.map((s) => s.trim()).filter(Boolean).slice(0, 12);
  if (!norm(name) || !clean.length) return "A routine needs a name and at least one step.";
  store[ROUTINE_PREFIX + norm(name)] = JSON.stringify({ name: name.trim(), steps: clean });
  const instant = clean.every((s) => directTurn(s)?.kind === "open");
  return `Saved routine "${name.trim()}" (${clean.length} step${clean.length > 1 ? "s" : ""}: ${clean.join("; ")}). Say "${name.trim()}" to run it${instant ? " - it runs instantly, no AI needed" : ""}.`;
}

export function deleteRoutine(store: Record<string, string>, name: string): string {
  const key = ROUTINE_PREFIX + norm(name);
  if (!(key in store)) return `No routine called "${name}".`;
  delete store[key];
  return `Deleted routine "${name}".`;
}

/** The routine a message asks to run: its name alone, or "run <name>". */
export function matchRoutine(message: string, store: Record<string, string>): Routine | null {
  const said = norm(message);
  if (!said || said.split(" ").length > 8) return null;
  const routines = readRoutines(store);
  const asked = norm(TRIGGER.exec(said)?.[1] ?? said);
  return routines.find((r) => norm(r.name) === said || norm(r.name) === asked) ?? null;
}

/** Runs a routine with no model when every step is one the app does itself. */
export function runInstant(routine: Routine): { text: string; sideEffects: OpenTurn["sideEffects"] } | null {
  const turns = routine.steps.map((s) => directTurn(s));
  if (!turns.every((t): t is OpenTurn => t?.kind === "open")) return null;
  const open = turns as OpenTurn[];
  return {
    text: `Running ${routine.name}. ${open.map((t) => t.text).join(" ")}`,
    sideEffects: open.flatMap((t) => t.sideEffects),
  };
}

/** What the assistant is told when a routine needs it. */
export function routineBrief(routine: Routine): string {
  return `## Saved routine triggered\nThe user's message is the name of their saved routine "${routine.name}". Carry out its steps now, in order, using your tools, then confirm in one line what ran:\n${routine.steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}`;
}
