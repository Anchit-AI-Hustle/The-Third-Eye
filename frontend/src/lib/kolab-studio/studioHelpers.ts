// web/lib/studioHelpers.ts
// Pure helpers + static content for Creator Studio (ported from the prototype). No I/O, so
// they're shared by server and client and are unit-tested.
import type { AssetType, PlanStatus } from "./types";

export const PILLAR_COLORS = [
  "var(--kolab-lime)",
  "var(--kolab-sky)",
  "var(--kolab-violet)",
  "var(--kolab-gold)",
  "var(--kolab-clay)",
];
export const pillarColor = (i: number) => PILLAR_COLORS[i % PILLAR_COLORS.length];

export const DEFAULT_PILLARS: { name: string; role: string }[] = [
  { name: "Real talk", role: "Builds trust" },
  { name: "How-to / educate", role: "Builds authority" },
  { name: "Motivation", role: "Drives shares" },
  { name: "Behind the scenes", role: "Builds connection" },
  { name: "Community / Q&A", role: "Drives engagement" },
];

export const ASSET_META: Record<AssetType, { c: string; l: string }> = {
  video: { c: "#E8604A", l: "Video" },
  carousel: { c: "#5BC8E8", l: "Carousel" },
  photo: { c: "#E8B84A", l: "Photo" },
  loop: { c: "#B98CFF", l: "Loop" },
};

export const BLUEPRINTS: { t: string; steps: string[] }[] = [
  {
    t: "Reel",
    steps: [
      "Hook on-screen in the first frame (spoken + text)",
      "Relate: one honest line",
      "Value: one idea, quick cuts",
      "Proof: your result or a viewer's",
      "CTA as the last frame",
    ],
  },
  {
    t: "Carousel",
    steps: [
      "Slide 1 = the hook, big and readable",
      "One point per slide (5–8 slides)",
      "Show, don't just tell",
      "Recap slide",
      "Save / share prompt on the last slide",
    ],
  },
  {
    t: "Story",
    steps: [
      "Open with a question or poll",
      "Show the moment / behind the scenes",
      "Add context in text",
      "Reply to DMs on camera",
      "Swipe-up / link CTA",
    ],
  },
  {
    t: "Static",
    steps: [
      "Strong visual or quote",
      "One clear message",
      "Value in the first two lines",
      "On-brand caption",
      "Comment prompt",
    ],
  },
];

export const AUTO_STEPS: { n: string; h: string; p: string }[] = [
  { n: "01", h: "Plan", p: "Lock the week's ideas in the Calendar." },
  { n: "02", h: "Batch", p: "Film all video + shoot photos in one session." },
  { n: "03", h: "Edit & caption", p: "Cut clips, build carousels, drop in captions." },
  { n: "04", h: "Schedule", p: "Queue everything; the week runs itself." },
];

export const TK_STATUSES: PlanStatus[] = ["to_shoot", "shot", "edited", "scheduled", "posted"];
export const TK_LABEL: Record<PlanStatus, string> = {
  to_shoot: "To shoot",
  shot: "Shot",
  edited: "Edited",
  scheduled: "Scheduled",
  posted: "Posted",
};

export interface PlanItemLike {
  asset_type: AssetType | null;
  status: PlanStatus;
  done: boolean;
}

/** Asset-type mix across the plan (Asset Map). */
export function assetMix(plan: PlanItemLike[]): { counts: Record<AssetType, number>; total: number } {
  const counts: Record<AssetType, number> = { video: 0, carousel: 0, photo: 0, loop: 0 };
  for (const p of plan) if (p.asset_type) counts[p.asset_type]++;
  return { counts, total: plan.length };
}

/** Tracker progress = posted / total. */
export function trackerProgress(plan: PlanItemLike[]): { posted: number; total: number; pct: number } {
  const posted = plan.filter((p) => p.status === "posted").length;
  const total = plan.length;
  return { posted, total, pct: total ? Math.round((posted / total) * 100) : 0 };
}

/** CSV export of the content plan (Tracker → Excel). */
export interface PlanCsvRow {
  date: string | null;
  time: string | null;
  pillar: string;
  format: string | null;
  asset_type: AssetType | null;
  hook: string | null;
  status: PlanStatus;
  done: boolean;
  notes: string | null;
}
export function planToCsv(rows: PlanCsvRow[]): string {
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const header = ["Date", "Time", "Pillar", "Format", "Asset", "Hook", "Status", "Done", "Notes"];
  const body = rows.map((r) =>
    [
      r.date ?? "",
      r.time ?? "",
      r.pillar,
      r.format ?? "",
      r.asset_type ? ASSET_META[r.asset_type].l : "",
      r.hook ?? "",
      TK_LABEL[r.status],
      r.done ? "Yes" : "",
      r.notes ?? "",
    ]
      .map(esc)
      .join(","),
  );
  return [header.map(esc).join(","), ...body].join("\r\n");
}
