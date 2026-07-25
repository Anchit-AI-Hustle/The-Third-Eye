// Curated, REAL health/fitness platforms to discover and book events on. We
// never scrape or auto-book — each tile redirects to the provider where the user
// sees live timings and books. Users can also save their own recurring events
// (device vault) with any frequency; the app reminds them locally.

export type EventFormat = "in_person" | "online" | "both";
export type ActivityType =
  | "yoga" | "running" | "gym" | "cycling" | "badminton" | "pickleball"
  | "football" | "cricket" | "swimming" | "meditation" | "general";

export interface EventPlatform {
  id: string;
  name: string;
  activities: ActivityType[];
  format: EventFormat;
  url: string;
  blurb: string;
  region?: string;
}

export const EVENT_PLATFORMS: EventPlatform[] = [
  { id: "hudle", name: "Hudle", activities: ["badminton", "pickleball", "football", "cricket", "swimming", "general"], format: "in_person", url: "https://hudle.in", blurb: "Book turfs, courts, pools & sports venues by the hour", region: "India" },
  { id: "playo", name: "Playo", activities: ["badminton", "pickleball", "football", "cricket", "general"], format: "in_person", url: "https://playo.co", blurb: "Find venues, games & players near you", region: "India" },
  { id: "khelomore", name: "KheloMore", activities: ["badminton", "football", "cricket", "swimming"], format: "in_person", url: "https://www.khelomore.com", blurb: "Book sports facilities & academies", region: "India" },
  { id: "cultfit", name: "Cult.fit", activities: ["gym", "yoga", "cycling", "meditation", "general"], format: "both", url: "https://www.cult.fit", blurb: "Group classes, gyms & live online workouts" },
  { id: "district", name: "District (by Zomato)", activities: ["running", "general"], format: "in_person", url: "https://www.district.in", blurb: "Discover live events, marathons & activities", region: "India" },
  { id: "bookmyshow", name: "BookMyShow Sports", activities: ["running", "general"], format: "in_person", url: "https://in.bookmyshow.com/explore/sports-events", blurb: "Marathons, sports & fitness events", region: "India" },
  { id: "tcs10k", name: "TCS World 10K", activities: ["running"], format: "in_person", url: "https://www.tcsworld10k.procam.in", blurb: "Bengaluru 10K — official registration", region: "India" },
  { id: "mumbai-marathon", name: "Tata Mumbai Marathon", activities: ["running"], format: "in_person", url: "https://www.tatamumbaimarathon.procam.in", blurb: "Full / half marathon — official", region: "India" },
  { id: "sarva", name: "Sarva Yoga", activities: ["yoga", "meditation"], format: "both", url: "https://www.sarva.life", blurb: "Yoga studios & online classes" },
  { id: "decathlon", name: "Decathlon Play", activities: ["running", "cycling", "general"], format: "in_person", url: "https://www.decathlon.in", blurb: "Community runs, rides & sports events", region: "India" },
  { id: "strava", name: "Strava", activities: ["running", "cycling"], format: "online", url: "https://www.strava.com", blurb: "Track runs/rides & join challenges" },
  { id: "meetup-fitness", name: "Meetup Fitness", activities: ["running", "yoga", "general"], format: "both", url: "https://www.meetup.com/find/?keywords=fitness", blurb: "Local fitness & wellness groups" },
];

export type Frequency = "once" | "daily" | "weekly" | "monthly" | "custom";

export interface SubscribedEvent {
  id: string;
  title: string;
  activity: ActivityType;
  format: EventFormat;
  frequency: Frequency;
  customEveryDays?: number; // when frequency = custom
  durationMin?: number;
  time?: string; // HH:MM
  daysOfWeek?: number[]; // for weekly
  platformId?: string;
  url?: string;
  notes?: string;
  createdAt: string;
}

export const ACTIVITY_LABELS: Record<ActivityType, string> = {
  yoga: "Yoga", running: "Running", gym: "Gym", cycling: "Cycling", badminton: "Badminton",
  pickleball: "Pickleball", football: "Football", cricket: "Cricket", swimming: "Swimming",
  meditation: "Meditation", general: "General",
};

/** Human-readable schedule (with duration in hours) for a subscribed event. */
export function describeSchedule(e: SubscribedEvent): string {
  const dur = e.durationMin ? ` · ${(e.durationMin / 60).toFixed(e.durationMin % 60 ? 1 : 0)}h` : "";
  const at = e.time ? ` at ${e.time}` : "";
  switch (e.frequency) {
    case "once": return `One-time${at}${dur}`;
    case "daily": return `Every day${at}${dur}`;
    case "weekly": {
      const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      const d = (e.daysOfWeek || []).map((i) => names[i]).join(", ");
      return `Weekly${d ? ` (${d})` : ""}${at}${dur}`;
    }
    case "monthly": return `Monthly${at}${dur}`;
    case "custom": return `Every ${e.customEveryDays || 2} days${at}${dur}`;
  }
}
