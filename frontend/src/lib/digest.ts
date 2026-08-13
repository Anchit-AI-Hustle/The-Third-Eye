// The daily digest is worth reading only if it takes a position. This picks the
// single thing worth doing first and says why, so the ranking isn't left to the
// reader. Returns both an HTML form (for the email) and a plain one (for the
// push notification, which is what actually reaches them).

export interface DigestTask {
  title: string;
  status?: string;
  priority?: string | null;
  due_date?: string | null;
}

export interface DigestGoal {
  title: string;
  current?: number | null;
  target?: number | null;
  unit?: string | null;
}

const PRIORITY_RANK: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

function rank(t: DigestTask): number {
  return PRIORITY_RANK[String(t.priority ?? "").toLowerCase()] ?? 2;
}

function byUrgency(a: DigestTask, b: DigestTask): number {
  return rank(a) - rank(b) || String(a.due_date ?? "9999").localeCompare(String(b.due_date ?? "9999"));
}

function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(fromIso) - Date.parse(toIso)) / 86_400_000);
}

export function leadRecommendation(
  tasks: DigestTask[],
  goals: DigestGoal[],
  date: string,
): { html: string; text: string } | null {
  const open = tasks.filter((t) => t.status !== "done" && t.status !== "cancelled");

  const overdue = open.filter((t) => t.due_date && t.due_date < date).sort(byUrgency);
  if (overdue.length) {
    const t = overdue[0];
    const days = daysBetween(date, t.due_date!);
    const trailing =
      overdue.length > 1
        ? `, and ${overdue.length - 1} other${overdue.length > 2 ? "s are" : " is"} behind it`
        : "";
    return phrase(`Start with `, t.title, ` — it's ${days} day${days === 1 ? "" : "s"} overdue${trailing}.`);
  }

  const dueToday = open.filter((t) => t.due_date === date).sort(byUrgency);
  if (dueToday.length) {
    const trailing =
      dueToday.length > 1 ? `, along with ${dueToday.length - 1} other${dueToday.length > 2 ? "s" : ""}` : "";
    return phrase(`Start with `, dueToday[0].title, ` — due today${trailing}.`);
  }

  const upcoming = open.filter((t) => t.due_date && t.due_date > date).sort(byUrgency);
  if (upcoming.length && rank(upcoming[0]) <= 1) {
    return phrase(`Nothing is due today, so get ahead on `, upcoming[0].title, ` (due ${upcoming[0].due_date}).`);
  }

  const behind = goals
    .filter((g) => Number(g.target) > 0)
    .map((g) => ({ g, pct: Number(g.current ?? 0) / Number(g.target) }))
    .sort((a, b) => a.pct - b.pct);
  if (behind.length && behind[0].pct < 0.5) {
    const { g, pct } = behind[0];
    return phrase(`No deadlines today — a good day to move `, g.title, `, which is at ${Math.round(pct * 100)}% of target.`);
  }

  if (upcoming.length) {
    return phrase(`Nothing due today. Next up is `, upcoming[0].title, ` on ${upcoming[0].due_date}.`);
  }
  return null;
}

function phrase(before: string, subject: string, after: string): { html: string; text: string } {
  return {
    html: `${before}<b>${escapeHtml(subject)}</b>${after}`,
    text: `${before}${subject}${after}`,
  };
}
