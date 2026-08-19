// web/lib/marketing/calendar.ts
// Festival / cultural-moment calendar + a deterministic campaign-calendar generator, ported and
// generalised from vahdam-lifecycle-os (data/festivals.json + the Smart Brain calendar logic).
// India-first (Kolab's market) with US/UK majors. Each moment carries a commercial weight (1–10),
// tags, and recommended RFM segments. The generator is pure/deterministic — no fabricated copy or
// offers (a moment is a slot; the brand fills the creative).
import type { RfmSegment } from "./rfm";

export type Market = "IN" | "US" | "UK";

export interface Moment {
  date: string; // MM-DD
  name: string;
  weight: number; // 1–10 commercial relevance
  tags: string[];
  segments: RfmSegment[]; // recommended target segments
}

// India — full set (Kolab's home market).
const IN_MOMENTS: Moment[] = [
  { date: "01-14", name: "Makar Sankranti / Pongal", weight: 7, tags: ["festive", "harvest", "family"], segments: ["Champions", "Loyal", "Promising"] },
  { date: "01-26", name: "Republic Day", weight: 8, tags: ["national", "heritage", "sale"], segments: ["Champions", "Loyal", "Promising", "New"] },
  { date: "02-14", name: "Valentine's Day", weight: 6, tags: ["gift", "couple"], segments: ["Champions", "Loyal", "New"] },
  { date: "03-13", name: "Holi", weight: 9, tags: ["festive", "colour", "joy"], segments: ["Champions", "Loyal", "Promising", "New"] },
  { date: "04-14", name: "Baisakhi / Tamil New Year", weight: 6, tags: ["harvest", "festive"], segments: ["Loyal", "Promising"] },
  { date: "05-12", name: "Mother's Day", weight: 8, tags: ["gift", "family"], segments: ["Champions", "Loyal", "New"] },
  { date: "06-21", name: "International Yoga Day", weight: 7, tags: ["wellness", "ritual"], segments: ["Loyal", "Champions"] },
  { date: "07-15", name: "Monsoon onset", weight: 6, tags: ["seasonal"], segments: ["Loyal", "Promising"] },
  { date: "08-09", name: "Raksha Bandhan", weight: 9, tags: ["festive", "gift", "siblings"], segments: ["Champions", "Loyal", "New"] },
  { date: "08-15", name: "Independence Day", weight: 8, tags: ["national", "sale"], segments: ["Need Attention", "At Risk", "Loyal"] },
  { date: "09-07", name: "Ganesh Chaturthi", weight: 7, tags: ["festive", "family"], segments: ["Champions", "Loyal", "Promising"] },
  { date: "10-13", name: "Karwa Chauth", weight: 6, tags: ["festive", "couple", "gift"], segments: ["Champions", "Loyal"] },
  { date: "10-20", name: "Dussehra", weight: 7, tags: ["festive", "family"], segments: ["Champions", "Loyal", "Promising"] },
  { date: "10-31", name: "Dhanteras", weight: 9, tags: ["festive", "gift", "prosperity"], segments: ["Champions", "Loyal", "Promising", "New"] },
  { date: "11-01", name: "Diwali", weight: 10, tags: ["festive", "gift", "family", "prosperity"], segments: ["Champions", "Loyal", "Promising", "New", "Need Attention"] },
  { date: "11-03", name: "Bhai Dooj", weight: 6, tags: ["festive", "siblings", "gift"], segments: ["Champions", "Loyal"] },
  { date: "11-27", name: "Black Friday", weight: 9, tags: ["sale", "high-intent"], segments: ["Need Attention", "At Risk", "Hibernating", "Loyal", "Champions"] },
  { date: "11-30", name: "Cyber Monday", weight: 8, tags: ["sale"], segments: ["Need Attention", "At Risk", "Loyal"] },
  { date: "12-25", name: "Christmas", weight: 7, tags: ["gift", "family"], segments: ["Champions", "Loyal", "New"] },
  { date: "12-31", name: "New Year's Eve", weight: 7, tags: ["reset", "reflection"], segments: ["Champions", "Loyal", "Promising"] },
];

const US_MAJORS: Moment[] = [
  { date: "05-21", name: "International Tea Day", weight: 10, tags: ["category"], segments: ["Champions", "Loyal", "Promising", "New"] },
  { date: "11-27", name: "Black Friday", weight: 10, tags: ["sale", "high-intent"], segments: ["Need Attention", "At Risk", "Hibernating", "Loyal", "Champions"] },
  { date: "11-30", name: "Cyber Monday", weight: 10, tags: ["sale"], segments: ["Need Attention", "At Risk", "Loyal"] },
  { date: "12-25", name: "Christmas Day", weight: 9, tags: ["gift"], segments: ["Champions", "Loyal", "New"] },
];

const UK_MAJORS: Moment[] = [
  { date: "05-21", name: "International Tea Day", weight: 10, tags: ["category"], segments: ["Champions", "Loyal", "Promising", "New"] },
  { date: "11-27", name: "Black Friday", weight: 10, tags: ["sale"], segments: ["Need Attention", "At Risk", "Loyal", "Champions"] },
  { date: "12-26", name: "Boxing Day", weight: 8, tags: ["sale"], segments: ["Loyal", "Need Attention", "At Risk"] },
];

export const MOMENTS: Record<Market, Moment[]> = { IN: IN_MOMENTS, US: US_MAJORS, UK: UK_MAJORS };

/** Moments within `days` of `from` (inclusive), sorted by date, wrapping the year end.
 *  Dates are handled as UTC calendar days so an MM-DD like 01-26 never shifts to the previous
 *  day when formatted in a positive-offset timezone (e.g. Asia/Kolkata). */
export function upcomingMoments(market: Market, from: Date, days: number): (Moment & { when: Date })[] {
  const list = MOMENTS[market] ?? [];
  const out: (Moment & { when: Date })[] = [];
  // Anchor to the calendar day shown to the user (from's local Y/M/D), as a UTC midnight instant.
  const fromDayMs = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const horizonMs = fromDayMs + days * 24 * 60 * 60 * 1000;
  for (const m of list) {
    const [mm, dd] = m.date.split("-").map((n) => parseInt(n, 10));
    // Consider this year's and next year's occurrence to handle the wrap.
    for (const year of [from.getFullYear(), from.getFullYear() + 1]) {
      const whenMs = Date.UTC(year, mm - 1, dd);
      if (whenMs >= fromDayMs && whenMs <= horizonMs) out.push({ ...m, when: new Date(whenMs) });
    }
  }
  return out.sort((a, b) => a.when.getTime() - b.when.getTime());
}

export interface CalendarSlot {
  date: string; // YYYY-MM-DD
  name: string;
  weight: number;
  tags: string[];
  segments: RfmSegment[];
  kind: "festive" | "sale";
}

/** Deterministic N-day campaign calendar of festive/sale slots (no fabricated copy/offers). */
export function generateCampaignCalendar(market: Market, from: Date, days: number): CalendarSlot[] {
  return upcomingMoments(market, from, days).map((m) => ({
    date: m.when.toISOString().slice(0, 10),
    name: m.name,
    weight: m.weight,
    tags: m.tags,
    segments: m.segments,
    kind: m.tags.includes("sale") ? "sale" : "festive",
  }));
}
