// The current date, told to the model.
//
// manage_tasks asks it to turn "tomorrow" or "Friday" into a YYYY-MM-DD due
// date, but nothing in the prompt said what day it is — so it answered from its
// training data and set due dates months in the past, which the tracker then
// rendered as overdue the moment they were created. get_current_time existed,
// but the model has no reason to call it before writing a date it believes it
// already knows.

/** Resolve the operator's calendar day, falling back to UTC. */
export function todayIn(timezone?: string, now = new Date()): { date: string; weekday: string; zone: string } {
  const zone = validZone(timezone) ? (timezone as string) : "UTC";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "long",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, weekday: get("weekday"), zone };
}

function validZone(tz?: string): boolean {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function todayBlock(timezone?: string, now = new Date()): string {
  const { date, weekday, zone } = todayIn(timezone, now);
  return `## Today
Today is ${weekday}, ${date} (${zone}). Every relative date the user gives — "today",
"tomorrow", "Friday", "next week", "in 3 days" — is relative to this. Resolve it
yourself from this date when setting a due date, deadline or reminder; never
guess a year and never write a date in the past for something upcoming.`;
}
