// The App Hub registry — a mode-aware "life OS" launcher. Each entry is either
// a SELF-BUILT app (an internal route whose data lives in the device vault) or
// an EXTERNAL app (a compliant deep-link to the real service — we never scrape
// or automate a logged-in third-party account). Grouped by mode → category.

export type AppMode = "personal" | "professional" | "enterprise";

export interface AppEntry {
  id: string;
  label: string;
  category: string;
  modes: AppMode[];
  kind: "internal" | "external";
  href: string; // internal route, external https url, or tel: for emergencies
  icon: string; // lucide icon name
  blurb?: string;
  selfBuilt?: boolean; // our own app, data stays on-device
  emergency?: boolean;
}

const P: AppMode = "personal", PR: AppMode = "professional", E: AppMode = "enterprise";

export const APPS: AppEntry[] = [
  // ── Personal · Create & Play (self-built + the giants) ──
  { id: "music-studio", label: "Music Studio", category: "Create & Play", modes: [P], kind: "internal", href: "/tools/music", icon: "Music", selfBuilt: true, blurb: "Generate & play your own tracks" },
  { id: "video-studio", label: "Video / OTT Studio", category: "Create & Play", modes: [P], kind: "internal", href: "/tools/video", icon: "Clapperboard", selfBuilt: true, blurb: "Scripts & series concepts" },
  { id: "youtube", label: "YouTube", category: "Create & Play", modes: [P], kind: "external", href: "https://www.youtube.com", icon: "Play" },
  { id: "spotify", label: "Spotify", category: "Create & Play", modes: [P], kind: "external", href: "https://open.spotify.com", icon: "Music2" },
  { id: "suno", label: "Suno", category: "Create & Play", modes: [P], kind: "external", href: "https://suno.com", icon: "AudioLines" },
  { id: "elevenlabs", label: "ElevenLabs", category: "Create & Play", modes: [P], kind: "external", href: "https://elevenlabs.io", icon: "Mic" },

  // ── Personal · Social ──
  { id: "whatsapp", label: "WhatsApp", category: "Social", modes: [P, PR], kind: "external", href: "https://web.whatsapp.com", icon: "MessageCircle" },
  { id: "instagram", label: "Instagram", category: "Social", modes: [P], kind: "external", href: "https://www.instagram.com", icon: "Camera" },
  { id: "facebook", label: "Facebook", category: "Social", modes: [P], kind: "external", href: "https://www.facebook.com", icon: "Users" },
  { id: "snapchat", label: "Snapchat", category: "Social", modes: [P], kind: "external", href: "https://web.snapchat.com", icon: "Ghost" },
  { id: "x", label: "X", category: "Social", modes: [P, PR], kind: "external", href: "https://x.com", icon: "AtSign" },
  { id: "social-studio", label: "Social Media Studio", category: "Social", modes: [P], kind: "internal", href: "/tools/social-media", icon: "Share2", selfBuilt: true, blurb: "Draft posts for any platform" },

  // ── Personal · Food & Grocery ──
  { id: "swiggy", label: "Swiggy", category: "Food & Grocery", modes: [P], kind: "external", href: "https://www.swiggy.com", icon: "UtensilsCrossed" },
  { id: "zomato", label: "Zomato", category: "Food & Grocery", modes: [P], kind: "external", href: "https://www.zomato.com", icon: "UtensilsCrossed" },
  { id: "blinkit", label: "Blinkit", category: "Food & Grocery", modes: [P], kind: "external", href: "https://blinkit.com", icon: "ShoppingBasket" },
  { id: "zepto", label: "Zepto", category: "Food & Grocery", modes: [P], kind: "external", href: "https://www.zeptonow.com", icon: "ShoppingBasket" },
  { id: "bigbasket", label: "BigBasket", category: "Food & Grocery", modes: [P], kind: "external", href: "https://www.bigbasket.com", icon: "ShoppingBasket" },
  { id: "health-engine-food", label: "Health Engine", category: "Food & Grocery", modes: [P], kind: "internal", href: "/tools/health", icon: "HeartPulse", selfBuilt: true, blurb: "Meals, macros & diet plan" },

  // ── Personal · Shopping ──
  { id: "amazon", label: "Amazon", category: "Shopping", modes: [P], kind: "external", href: "https://www.amazon.in", icon: "ShoppingCart" },
  { id: "flipkart", label: "Flipkart", category: "Shopping", modes: [P], kind: "external", href: "https://www.flipkart.com", icon: "ShoppingCart" },
  { id: "myntra", label: "Myntra", category: "Shopping", modes: [P], kind: "external", href: "https://www.myntra.com", icon: "Shirt" },

  // ── Personal · Money ──
  { id: "finance", label: "Finance", category: "Money", modes: [P, PR, E], kind: "internal", href: "/finance", icon: "BarChart2", selfBuilt: true, blurb: "Track spend, on-device" },
  { id: "budget-studio", label: "Budget Planner", category: "Money", modes: [P], kind: "internal", href: "/tools/budget", icon: "Wallet", selfBuilt: true },
  { id: "phonepe", label: "PhonePe", category: "Money", modes: [P], kind: "external", href: "https://www.phonepe.com", icon: "Smartphone" },
  { id: "gpay", label: "Google Pay", category: "Money", modes: [P], kind: "external", href: "https://pay.google.com", icon: "CreditCard" },
  { id: "paytm", label: "Paytm", category: "Money", modes: [P], kind: "external", href: "https://paytm.com", icon: "CreditCard" },

  // ── Personal · Health & Emergency ──
  { id: "health-engine", label: "Health Engine", category: "Health & Emergency", modes: [P], kind: "internal", href: "/tools/health", icon: "HeartPulse", selfBuilt: true, blurb: "Nutrition + exercise, goal-driven" },
  { id: "health-events", label: "Health Events", category: "Health & Emergency", modes: [P], kind: "internal", href: "/tools/health", icon: "CalendarClock", selfBuilt: true, blurb: "Classes, runs, court booking" },
  { id: "practo", label: "Doctor (Practo)", category: "Health & Emergency", modes: [P], kind: "external", href: "https://www.practo.com", icon: "Stethoscope" },
  { id: "apollo", label: "Apollo 24|7", category: "Health & Emergency", modes: [P], kind: "external", href: "https://www.apollo247.com", icon: "HeartPulse" },
  { id: "onemg", label: "Pharmacy (1mg)", category: "Health & Emergency", modes: [P], kind: "external", href: "https://www.1mg.com", icon: "Pill" },
  { id: "sos-112", label: "Emergency 112", category: "Health & Emergency", modes: [P], kind: "external", href: "tel:112", icon: "Siren", emergency: true, blurb: "All-in-one emergency" },
  { id: "ambulance", label: "Ambulance 102", category: "Health & Emergency", modes: [P], kind: "external", href: "tel:102", icon: "Ambulance", emergency: true },
  { id: "police", label: "Police 100", category: "Health & Emergency", modes: [P], kind: "external", href: "tel:100", icon: "ShieldAlert", emergency: true },

  // ── Personal · Travel & Local ──
  { id: "trip-planner", label: "Trip Planner", category: "Travel & Local", modes: [P], kind: "internal", href: "/tools/travel", icon: "Plane", selfBuilt: true },
  { id: "uber", label: "Uber", category: "Travel & Local", modes: [P], kind: "external", href: "https://m.uber.com", icon: "Car" },
  { id: "ola", label: "Ola", category: "Travel & Local", modes: [P], kind: "external", href: "https://www.olacabs.com", icon: "Car" },
  { id: "mmt", label: "MakeMyTrip", category: "Travel & Local", modes: [P], kind: "external", href: "https://www.makemytrip.com", icon: "Plane" },
  { id: "maps", label: "Maps", category: "Travel & Local", modes: [P, PR], kind: "external", href: "https://maps.google.com", icon: "MapPin" },

  // ── Personal · News & Sports ──
  { id: "news", label: "Google News", category: "News & Sports", modes: [P, PR], kind: "external", href: "https://news.google.com", icon: "Newspaper" },
  { id: "cricbuzz", label: "Cricbuzz", category: "News & Sports", modes: [P], kind: "external", href: "https://www.cricbuzz.com", icon: "Trophy" },
  { id: "espn", label: "ESPN", category: "News & Sports", modes: [P], kind: "external", href: "https://www.espn.com", icon: "Trophy" },

  // ── Personal · Games & OTT ──
  { id: "netflix", label: "Netflix", category: "Games & OTT", modes: [P], kind: "external", href: "https://www.netflix.com", icon: "Clapperboard" },
  { id: "primevideo", label: "Prime Video", category: "Games & OTT", modes: [P], kind: "external", href: "https://www.primevideo.com", icon: "Clapperboard" },
  { id: "hotstar", label: "JioHotstar", category: "Games & OTT", modes: [P], kind: "external", href: "https://www.hotstar.com", icon: "Clapperboard" },
  { id: "play-games", label: "Games", category: "Games & OTT", modes: [P], kind: "external", href: "https://play.google.com/store/games", icon: "Gamepad2" },

  // ── Personal · Life & Plans (self-built) ──
  { id: "tasks", label: "Task Tracker", category: "Life & Plans", modes: [P, PR, E], kind: "internal", href: "/tasks", icon: "CheckSquare", selfBuilt: true },
  { id: "notes", label: "Notes", category: "Life & Plans", modes: [P, PR, E], kind: "internal", href: "/notes", icon: "FileText", selfBuilt: true },
  { id: "goals", label: "Goals", category: "Life & Plans", modes: [P], kind: "internal", href: "/goals", icon: "Target", selfBuilt: true },
  { id: "assistant", label: "Assistant", category: "Life & Plans", modes: [P, PR, E], kind: "internal", href: "/assistant", icon: "MessageSquare", selfBuilt: true },

  // ── Professional · Work & Comms ──
  { id: "gmail", label: "Gmail", category: "Work & Comms", modes: [PR, E], kind: "external", href: "https://mail.google.com", icon: "Mail" },
  { id: "gcal", label: "Calendar", category: "Work & Comms", modes: [PR, E], kind: "external", href: "https://calendar.google.com", icon: "CalendarDays" },
  { id: "slack", label: "Slack", category: "Work & Comms", modes: [PR, E], kind: "external", href: "https://slack.com", icon: "Hash" },
  { id: "meet", label: "Google Meet", category: "Work & Comms", modes: [PR, E], kind: "external", href: "https://meet.google.com", icon: "Video" },
  { id: "linkedin-pro", label: "LinkedIn", category: "Work & Comms", modes: [PR], kind: "external", href: "https://www.linkedin.com", icon: "Contact" },

  // ── Professional · Create (Studio) ──
  { id: "studio", label: "Studio", category: "Create", modes: [PR, E], kind: "internal", href: "/tools", icon: "Wand2", selfBuilt: true, blurb: "Pages, mailers, ads, campaigns" },
  { id: "campaign", label: "Campaign Planner", category: "Create", modes: [PR], kind: "internal", href: "/tools/campaign", icon: "TrendingUp", selfBuilt: true },
  { id: "landing", label: "Landing Pages", category: "Create", modes: [PR], kind: "internal", href: "/tools/landing", icon: "LayoutTemplate", selfBuilt: true },

  // ── Professional · Career ──
  { id: "job-agent", label: "Job Agent", category: "Career", modes: [PR], kind: "internal", href: "/job-agent", icon: "Briefcase", selfBuilt: true, blurb: "Search, tailor, track" },

  // ── Enterprise · Operations ──
  { id: "lifecycle", label: "Lifecycle OS", category: "Operations", modes: [E], kind: "internal", href: "/tools/lifecycle", icon: "Workflow", selfBuilt: true },
  { id: "sop", label: "SOP Studio", category: "Operations", modes: [E], kind: "internal", href: "/tools/sop", icon: "ListChecks", selfBuilt: true },
  { id: "okr", label: "OKR Planner", category: "Operations", modes: [E], kind: "internal", href: "/tools/okr", icon: "Target", selfBuilt: true },

  // ── Enterprise · Docs & Knowledge ──
  { id: "report", label: "Report Studio", category: "Docs & Knowledge", modes: [E], kind: "internal", href: "/tools/report", icon: "FileBarChart", selfBuilt: true },
  { id: "knowledge", label: "Knowledge", category: "Docs & Knowledge", modes: [PR, E], kind: "internal", href: "/knowledge", icon: "BookOpen", selfBuilt: true },
  { id: "meeting", label: "Meeting Studio", category: "Docs & Knowledge", modes: [E], kind: "internal", href: "/tools/meeting", icon: "ClipboardList", selfBuilt: true },
];

export function appsForMode(mode: AppMode): AppEntry[] {
  return APPS.filter((a) => a.modes.includes(mode));
}

export function categoriesForMode(mode: AppMode): string[] {
  const seen: string[] = [];
  for (const a of appsForMode(mode)) if (!seen.includes(a.category)) seen.push(a.category);
  return seen;
}
