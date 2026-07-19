// Team OS — the structured business layer for Enterprise mode. A single-screen
// blend of a Google-Sheet tracker + Jira-style project status + OKR/roadmap
// planning: verticals → projects (with live metrics), objectives → key results,
// and a goals ladder from the current quarter out to 10 years. All state lives
// on-device (device vault), same as the rest of the app's self-built surfaces.

export type Horizon = "quarter" | "annual" | "3y" | "5y" | "10y";

export const HORIZONS: { id: Horizon; label: string; blurb: string; longRange: boolean }[] = [
  { id: "quarter", label: "This quarter", blurb: "90-day execution targets", longRange: false },
  { id: "annual", label: "Annual", blurb: "The year's north-star numbers", longRange: false },
  { id: "3y", label: "3-year", blurb: "Mid-range trajectory", longRange: true },
  { id: "5y", label: "5-year", blurb: "Strategic bets", longRange: true },
  { id: "10y", label: "10-year", blurb: "The long game / mission scale", longRange: true },
];

export type ProjectStatus = "planned" | "active" | "blocked" | "done";

export const PROJECT_STATUS: { id: ProjectStatus; label: string; color: string }[] = [
  { id: "planned", label: "Planned", color: "#8891A8" },
  { id: "active", label: "Active", color: "#4FC3F7" },
  { id: "blocked", label: "Blocked", color: "#F0776A" },
  { id: "done", label: "Done", color: "#34D399" },
];

/** A live metric on a project or the org dashboard. `trend` is % change vs the
 *  previous reading (positive = up), used only for display. */
export interface Metric {
  id: string;
  label: string;
  value: number;
  unit?: string;
  trend?: number;
}

export interface Vertical {
  id: string;
  name: string;
  color: string;
  note?: string;
}

export interface Project {
  id: string;
  name: string;
  verticalId: string;
  status: ProjectStatus;
  progress: number; // 0..100
  owner?: string;
  due?: string;
  reason?: string; // "the why" — rationale / expected impact
  metrics: Metric[];
  updatedAt: string;
}

export interface KeyResult {
  id: string;
  title: string;
  target: number;
  current: number;
  unit?: string;
}

export interface Objective {
  id: string;
  title: string;
  owner?: string;
  period: string; // e.g. "Q3 2026"
  keyResults: KeyResult[];
}

export interface Goal {
  id: string;
  title: string;
  horizon: Horizon;
  metric?: string;
  target?: number;
  current?: number;
  unit?: string;
  note?: string;
}

export interface TeamState {
  verticals: Vertical[];
  projects: Project[];
  objectives: Objective[];
  goals: Goal[];
}

export const VERTICAL_COLORS = ["#4FC3F7", "#34D399", "#A78BFA", "#F5C451", "#F0776A", "#5EEAD4", "#F472B6"];

/** Objective attainment = mean of its key-results' current/target (capped 100). */
export function objectiveProgress(o: Objective): number {
  if (!o.keyResults.length) return 0;
  const sum = o.keyResults.reduce((acc, kr) => acc + (kr.target > 0 ? Math.min(1, kr.current / kr.target) : 0), 0);
  return Math.round((sum / o.keyResults.length) * 100);
}

/** Goal attainment when it carries a target/current pair. */
export function goalProgress(g: Goal): number | null {
  if (g.target === undefined || g.target === 0 || g.current === undefined) return null;
  return Math.round(Math.min(1, g.current / g.target) * 100);
}
