// The App Hub registry — a mode-aware "life OS" launcher. Each entry is either
// a SELF-BUILT app (an internal route whose data lives in the device vault) or
// an EXTERNAL app (a compliant deep-link to the real service — we never scrape
// or automate a logged-in third-party account). Grouped by mode → category.
// Each category carries the leading (trending) apps in its space plus our own.

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
  // ── Personal · Music & Media ──
  { id: "music-studio", label: "Music Studio", category: "Music & Media", modes: [P], kind: "internal", href: "/tools/music", icon: "Music", selfBuilt: true, blurb: "Generate & play your own tracks" },
  { id: "video-studio", label: "Video Studio", category: "Music & Media", modes: [P], kind: "internal", href: "/tools/video", icon: "Clapperboard", selfBuilt: true, blurb: "Scripts & series concepts" },
  { id: "youtube", label: "YouTube", category: "Music & Media", modes: [P], kind: "external", href: "https://www.youtube.com", icon: "Play" },
  { id: "spotify", label: "Spotify", category: "Music & Media", modes: [P], kind: "external", href: "https://open.spotify.com", icon: "Music2" },
  { id: "jiosaavn", label: "JioSaavn", category: "Music & Media", modes: [P], kind: "external", href: "https://www.jiosaavn.com", icon: "Music2" },
  { id: "gaana", label: "Gaana", category: "Music & Media", modes: [P], kind: "external", href: "https://gaana.com", icon: "Music2" },
  { id: "suno", label: "Suno", category: "Music & Media", modes: [P], kind: "external", href: "https://suno.com", icon: "AudioLines" },
  { id: "elevenlabs", label: "ElevenLabs", category: "Music & Media", modes: [P], kind: "external", href: "https://elevenlabs.io", icon: "Mic" },

  // ── Personal · Social ──
  { id: "social-studio", label: "Social Media Studio", category: "Social", modes: [P], kind: "internal", href: "/tools/social-media", icon: "Share2", selfBuilt: true, blurb: "Draft posts for any platform" },
  { id: "whatsapp", label: "WhatsApp", category: "Social", modes: [P, PR], kind: "external", href: "https://web.whatsapp.com", icon: "MessageCircle" },
  { id: "instagram", label: "Instagram", category: "Social", modes: [P], kind: "external", href: "https://www.instagram.com", icon: "Camera" },
  { id: "facebook", label: "Facebook", category: "Social", modes: [P], kind: "external", href: "https://www.facebook.com", icon: "Users" },
  { id: "x", label: "X", category: "Social", modes: [P, PR], kind: "external", href: "https://x.com", icon: "AtSign" },
  { id: "threads", label: "Threads", category: "Social", modes: [P], kind: "external", href: "https://www.threads.net", icon: "AtSign" },
  { id: "snapchat", label: "Snapchat", category: "Social", modes: [P], kind: "external", href: "https://web.snapchat.com", icon: "Ghost" },
  { id: "telegram", label: "Telegram", category: "Social", modes: [P], kind: "external", href: "https://web.telegram.org", icon: "MessageCircle" },
  { id: "reddit", label: "Reddit", category: "Social", modes: [P], kind: "external", href: "https://www.reddit.com", icon: "MessageCircle" },
  { id: "pinterest", label: "Pinterest", category: "Social", modes: [P], kind: "external", href: "https://www.pinterest.com", icon: "Camera" },

  // ── Personal · Food & Grocery ──
  { id: "health-engine-food", label: "Health Engine", category: "Food & Grocery", modes: [P], kind: "internal", href: "/tools/health", icon: "HeartPulse", selfBuilt: true, blurb: "Meals, macros & diet plan" },
  { id: "swiggy", label: "Swiggy", category: "Food & Grocery", modes: [P], kind: "external", href: "https://www.swiggy.com", icon: "UtensilsCrossed" },
  { id: "zomato", label: "Zomato", category: "Food & Grocery", modes: [P], kind: "external", href: "https://www.zomato.com", icon: "UtensilsCrossed" },
  { id: "blinkit", label: "Blinkit", category: "Food & Grocery", modes: [P], kind: "external", href: "https://blinkit.com", icon: "ShoppingBasket" },
  { id: "zepto", label: "Zepto", category: "Food & Grocery", modes: [P], kind: "external", href: "https://www.zeptonow.com", icon: "ShoppingBasket" },
  { id: "bigbasket", label: "BigBasket", category: "Food & Grocery", modes: [P], kind: "external", href: "https://www.bigbasket.com", icon: "ShoppingBasket" },

  // ── Personal · Shopping ──
  { id: "amazon", label: "Amazon", category: "Shopping", modes: [P], kind: "external", href: "https://www.amazon.in", icon: "ShoppingCart" },
  { id: "flipkart", label: "Flipkart", category: "Shopping", modes: [P], kind: "external", href: "https://www.flipkart.com", icon: "ShoppingCart" },
  { id: "meesho", label: "Meesho", category: "Shopping", modes: [P], kind: "external", href: "https://www.meesho.com", icon: "ShoppingBag" },
  { id: "myntra", label: "Myntra", category: "Shopping", modes: [P], kind: "external", href: "https://www.myntra.com", icon: "Shirt" },
  { id: "ajio", label: "Ajio", category: "Shopping", modes: [P], kind: "external", href: "https://www.ajio.com", icon: "Shirt" },
  { id: "nykaa", label: "Nykaa", category: "Shopping", modes: [P], kind: "external", href: "https://www.nykaa.com", icon: "ShoppingBag" },

  // ── Personal · Money & Payments ──
  { id: "finance", label: "Finance", category: "Money & Payments", modes: [P, PR, E], kind: "internal", href: "/finance", icon: "BarChart2", selfBuilt: true, blurb: "Track spend, on-device" },
  { id: "budget-studio", label: "Budget Planner", category: "Money & Payments", modes: [P], kind: "internal", href: "/tools/budget", icon: "Wallet", selfBuilt: true },
  { id: "phonepe", label: "PhonePe", category: "Money & Payments", modes: [P], kind: "external", href: "https://www.phonepe.com", icon: "Smartphone" },
  { id: "gpay", label: "Google Pay", category: "Money & Payments", modes: [P], kind: "external", href: "https://pay.google.com", icon: "CreditCard" },
  { id: "paytm", label: "Paytm", category: "Money & Payments", modes: [P], kind: "external", href: "https://paytm.com", icon: "CreditCard" },
  { id: "cred", label: "CRED", category: "Money & Payments", modes: [P], kind: "external", href: "https://cred.club", icon: "CreditCard" },
  { id: "groww", label: "Groww", category: "Money & Payments", modes: [P], kind: "external", href: "https://groww.in", icon: "TrendingUp" },
  { id: "zerodha", label: "Zerodha", category: "Money & Payments", modes: [P], kind: "external", href: "https://kite.zerodha.com", icon: "BarChart2" },

  // ── Personal · Health & Emergency ──
  { id: "health-engine", label: "Health Engine", category: "Health & Emergency", modes: [P], kind: "internal", href: "/tools/health", icon: "HeartPulse", selfBuilt: true, blurb: "Nutrition + exercise, goal-driven" },
  { id: "health-events", label: "Health Events", category: "Health & Emergency", modes: [P], kind: "internal", href: "/tools/health", icon: "CalendarClock", selfBuilt: true, blurb: "Classes, runs, court booking" },
  { id: "practo", label: "Doctor (Practo)", category: "Health & Emergency", modes: [P], kind: "external", href: "https://www.practo.com", icon: "Stethoscope" },
  { id: "apollo", label: "Apollo 24|7", category: "Health & Emergency", modes: [P], kind: "external", href: "https://www.apollo247.com", icon: "HeartPulse" },
  { id: "onemg", label: "Pharmacy (1mg)", category: "Health & Emergency", modes: [P], kind: "external", href: "https://www.1mg.com", icon: "Pill" },
  { id: "cultfit", label: "Cult.fit", category: "Health & Emergency", modes: [P], kind: "external", href: "https://www.cult.fit", icon: "HeartPulse" },
  { id: "sos-112", label: "Emergency 112", category: "Health & Emergency", modes: [P], kind: "external", href: "tel:112", icon: "Siren", emergency: true, blurb: "All-in-one emergency" },
  { id: "ambulance", label: "Ambulance 102", category: "Health & Emergency", modes: [P], kind: "external", href: "tel:102", icon: "Ambulance", emergency: true },
  { id: "police", label: "Police 100", category: "Health & Emergency", modes: [P], kind: "external", href: "tel:100", icon: "ShieldAlert", emergency: true },

  // ── Personal · Travel & Local ──
  { id: "trip-planner", label: "Trip Planner", category: "Travel & Local", modes: [P], kind: "internal", href: "/tools/travel", icon: "Plane", selfBuilt: true },
  { id: "uber", label: "Uber", category: "Travel & Local", modes: [P], kind: "external", href: "https://m.uber.com", icon: "Car" },
  { id: "ola", label: "Ola", category: "Travel & Local", modes: [P], kind: "external", href: "https://www.olacabs.com", icon: "Car" },
  { id: "rapido", label: "Rapido", category: "Travel & Local", modes: [P], kind: "external", href: "https://www.rapido.bike", icon: "Car" },
  { id: "mmt", label: "MakeMyTrip", category: "Travel & Local", modes: [P], kind: "external", href: "https://www.makemytrip.com", icon: "Plane" },
  { id: "goibibo", label: "Goibibo", category: "Travel & Local", modes: [P], kind: "external", href: "https://www.goibibo.com", icon: "Plane" },
  { id: "irctc", label: "IRCTC Rail", category: "Travel & Local", modes: [P], kind: "external", href: "https://www.irctc.co.in", icon: "TrainFront" },
  { id: "maps", label: "Maps", category: "Travel & Local", modes: [P, PR], kind: "external", href: "https://maps.google.com", icon: "MapPin" },

  // ── Personal · News & Sports ──
  { id: "news", label: "Google News", category: "News & Sports", modes: [P, PR], kind: "external", href: "https://news.google.com", icon: "Newspaper" },
  { id: "inshorts", label: "Inshorts", category: "News & Sports", modes: [P], kind: "external", href: "https://www.inshorts.com", icon: "Newspaper" },
  { id: "toi", label: "Times of India", category: "News & Sports", modes: [P], kind: "external", href: "https://timesofindia.indiatimes.com", icon: "Newspaper" },
  { id: "ndtv", label: "NDTV", category: "News & Sports", modes: [P], kind: "external", href: "https://www.ndtv.com", icon: "Newspaper" },
  { id: "cricbuzz", label: "Cricbuzz", category: "News & Sports", modes: [P], kind: "external", href: "https://www.cricbuzz.com", icon: "Trophy" },
  { id: "espn", label: "ESPN", category: "News & Sports", modes: [P], kind: "external", href: "https://www.espn.com", icon: "Trophy" },

  // ── Personal · Entertainment ──
  { id: "netflix", label: "Netflix", category: "Entertainment", modes: [P], kind: "external", href: "https://www.netflix.com", icon: "Film" },
  { id: "primevideo", label: "Prime Video", category: "Entertainment", modes: [P], kind: "external", href: "https://www.primevideo.com", icon: "Film" },
  { id: "hotstar", label: "JioHotstar", category: "Entertainment", modes: [P], kind: "external", href: "https://www.hotstar.com", icon: "Film" },
  { id: "jiocinema", label: "JioCinema", category: "Entertainment", modes: [P], kind: "external", href: "https://www.jiocinema.com", icon: "Film" },
  { id: "sonyliv", label: "Sony LIV", category: "Entertainment", modes: [P], kind: "external", href: "https://www.sonyliv.com", icon: "Film" },
  { id: "play-games", label: "Games", category: "Entertainment", modes: [P], kind: "external", href: "https://play.google.com/store/games", icon: "Gamepad2" },

  // ── Personal · Planning (self-built + everyday tools) ──
  { id: "tasks", label: "Task Tracker", category: "Planning", modes: [P, PR, E], kind: "internal", href: "/tasks", icon: "CheckSquare", selfBuilt: true },
  { id: "notes", label: "Notes", category: "Planning", modes: [P, PR, E], kind: "internal", href: "/notes", icon: "FileText", selfBuilt: true },
  { id: "goals", label: "Goals", category: "Planning", modes: [P], kind: "internal", href: "/goals", icon: "Target", selfBuilt: true },
  { id: "assistant", label: "Assistant", category: "Planning", modes: [P, PR, E], kind: "internal", href: "/assistant", icon: "MessageSquare", selfBuilt: true },
  { id: "notion", label: "Notion", category: "Planning", modes: [P, PR], kind: "external", href: "https://www.notion.so", icon: "FileText" },
  { id: "gkeep", label: "Google Keep", category: "Planning", modes: [P], kind: "external", href: "https://keep.google.com", icon: "FileText" },
  { id: "todoist", label: "Todoist", category: "Planning", modes: [P], kind: "external", href: "https://todoist.com", icon: "CheckSquare" },

  // ── Calendar & Meetings (all modes — personal & work) ──
  { id: "gcal", label: "Google Calendar", category: "Calendar & Meetings", modes: [P, PR, E], kind: "external", href: "https://calendar.google.com", icon: "CalendarDays" },
  { id: "outlook-cal", label: "Outlook Calendar", category: "Calendar & Meetings", modes: [P, PR, E], kind: "external", href: "https://outlook.live.com/calendar/", icon: "CalendarRange" },
  { id: "apple-cal", label: "Apple Calendar", category: "Calendar & Meetings", modes: [P, PR, E], kind: "external", href: "https://www.icloud.com/calendar/", icon: "CalendarClock" },
  { id: "calendly", label: "Calendly", category: "Calendar & Meetings", modes: [P, PR, E], kind: "external", href: "https://calendly.com", icon: "CalendarCheck" },
  { id: "meet", label: "Google Meet", category: "Calendar & Meetings", modes: [P, PR, E], kind: "external", href: "https://meet.google.com", icon: "Video" },
  { id: "zoom", label: "Zoom", category: "Calendar & Meetings", modes: [P, PR, E], kind: "external", href: "https://zoom.us/join", icon: "Webcam" },
  { id: "teams", label: "Microsoft Teams", category: "Calendar & Meetings", modes: [P, PR, E], kind: "external", href: "https://teams.microsoft.com", icon: "Users" },
  { id: "webex", label: "Webex", category: "Calendar & Meetings", modes: [P, PR, E], kind: "external", href: "https://www.webex.com", icon: "Presentation" },
  { id: "skype", label: "Skype", category: "Calendar & Meetings", modes: [P, PR, E], kind: "external", href: "https://web.skype.com", icon: "MessageSquare" },
  { id: "whereby", label: "Whereby", category: "Calendar & Meetings", modes: [P, PR, E], kind: "external", href: "https://whereby.com", icon: "MonitorPlay" },

  // ── Work · Email & Messaging ──
  { id: "gmail", label: "Gmail", category: "Email & Messaging", modes: [PR, E], kind: "external", href: "https://mail.google.com", icon: "Mail" },
  { id: "outlook", label: "Outlook", category: "Email & Messaging", modes: [PR, E], kind: "external", href: "https://outlook.live.com", icon: "Mail" },
  { id: "slack", label: "Slack", category: "Email & Messaging", modes: [PR, E], kind: "external", href: "https://slack.com", icon: "Hash" },
  { id: "gchat", label: "Google Chat", category: "Email & Messaging", modes: [PR, E], kind: "external", href: "https://chat.google.com", icon: "MessageSquare" },
  { id: "discord", label: "Discord", category: "Email & Messaging", modes: [PR], kind: "external", href: "https://discord.com/app", icon: "MessageCircle" },
  { id: "linkedin-pro", label: "LinkedIn", category: "Email & Messaging", modes: [PR], kind: "external", href: "https://www.linkedin.com", icon: "Contact" },

  // ── Work · Content Studio ──
  { id: "studio", label: "Studio", category: "Content Studio", modes: [PR, E], kind: "internal", href: "/tools", icon: "Wand2", selfBuilt: true, blurb: "Pages, mailers, ads, campaigns" },
  { id: "campaign", label: "Campaign Planner", category: "Content Studio", modes: [PR], kind: "internal", href: "/tools/campaign", icon: "TrendingUp", selfBuilt: true },
  { id: "landing", label: "Landing Pages", category: "Content Studio", modes: [PR], kind: "internal", href: "/tools/landing", icon: "LayoutTemplate", selfBuilt: true },
  { id: "canva", label: "Canva", category: "Content Studio", modes: [PR, E], kind: "external", href: "https://www.canva.com", icon: "Palette" },
  { id: "figma", label: "Figma", category: "Content Studio", modes: [PR, E], kind: "external", href: "https://www.figma.com", icon: "Palette" },
  { id: "capcut", label: "CapCut", category: "Content Studio", modes: [PR], kind: "external", href: "https://www.capcut.com", icon: "Film" },
  { id: "adobe-express", label: "Adobe Express", category: "Content Studio", modes: [PR], kind: "external", href: "https://www.adobe.com/express/", icon: "Palette" },

  // ── Work · Marketing ──
  { id: "kolab", label: "Kolab", category: "Marketing", modes: [PR, E], kind: "internal", href: "/kolab", icon: "Workflow", selfBuilt: true, blurb: "Brand-adaptable Lifecycle OS & creator campaigns" },
  { id: "campaign-mkt", label: "Campaign Planner", category: "Marketing", modes: [PR], kind: "internal", href: "/tools/campaign", icon: "TrendingUp", selfBuilt: true },
  { id: "meta-ads", label: "Meta Ads", category: "Marketing", modes: [PR, E], kind: "external", href: "https://business.facebook.com/adsmanager", icon: "Megaphone" },
  { id: "google-ads", label: "Google Ads", category: "Marketing", modes: [PR, E], kind: "external", href: "https://ads.google.com", icon: "Megaphone" },
  { id: "mailchimp", label: "Mailchimp", category: "Marketing", modes: [PR], kind: "external", href: "https://mailchimp.com", icon: "Mail" },
  { id: "hubspot", label: "HubSpot", category: "Marketing", modes: [PR, E], kind: "external", href: "https://www.hubspot.com", icon: "TrendingUp" },
  { id: "hootsuite", label: "Hootsuite", category: "Marketing", modes: [PR], kind: "external", href: "https://hootsuite.com", icon: "Share2" },

  // ── Work · Careers ──
  { id: "job-agent", label: "Job Agent", category: "Careers", modes: [PR], kind: "internal", href: "/job-agent", icon: "Briefcase", selfBuilt: true, blurb: "Search, tailor, track" },
  { id: "linkedin-jobs", label: "LinkedIn Jobs", category: "Careers", modes: [PR], kind: "external", href: "https://www.linkedin.com/jobs", icon: "Contact" },
  { id: "naukri", label: "Naukri", category: "Careers", modes: [PR], kind: "external", href: "https://www.naukri.com", icon: "Briefcase" },
  { id: "indeed", label: "Indeed", category: "Careers", modes: [PR], kind: "external", href: "https://www.indeed.com", icon: "Briefcase" },
  { id: "wellfound", label: "Wellfound", category: "Careers", modes: [PR], kind: "external", href: "https://wellfound.com", icon: "Rocket" },
  { id: "instahyre", label: "Instahyre", category: "Careers", modes: [PR], kind: "external", href: "https://www.instahyre.com", icon: "Briefcase" },

  // ── Team · Operations ──
  { id: "kolab-ent", label: "Kolab Marketing AI", category: "Operations", modes: [E], kind: "internal", href: "/kolab", icon: "Workflow", selfBuilt: true, blurb: "Lifecycle, retention & GTM for any brand" },
  { id: "lifecycle", label: "Lifecycle OS", category: "Operations", modes: [E], kind: "internal", href: "/tools/lifecycle", icon: "Workflow", selfBuilt: true },
  { id: "sop", label: "SOP Studio", category: "Operations", modes: [E], kind: "internal", href: "/tools/sop", icon: "ListChecks", selfBuilt: true },
  { id: "okr", label: "OKR Planner", category: "Operations", modes: [E], kind: "internal", href: "/tools/okr", icon: "Target", selfBuilt: true },
  { id: "jira", label: "Jira", category: "Operations", modes: [E], kind: "external", href: "https://www.atlassian.com/software/jira", icon: "Kanban" },
  { id: "asana", label: "Asana", category: "Operations", modes: [E], kind: "external", href: "https://app.asana.com", icon: "ListChecks" },
  { id: "trello", label: "Trello", category: "Operations", modes: [E], kind: "external", href: "https://trello.com", icon: "Kanban" },
  { id: "monday", label: "monday.com", category: "Operations", modes: [E], kind: "external", href: "https://monday.com", icon: "Kanban" },
  { id: "clickup", label: "ClickUp", category: "Operations", modes: [E], kind: "external", href: "https://app.clickup.com", icon: "ListChecks" },

  // ── Team · Docs & Knowledge ──
  { id: "report", label: "Report Studio", category: "Docs & Knowledge", modes: [E], kind: "internal", href: "/tools/report", icon: "FileBarChart", selfBuilt: true },
  { id: "knowledge", label: "Knowledge", category: "Docs & Knowledge", modes: [PR, E], kind: "internal", href: "/knowledge", icon: "BookOpen", selfBuilt: true },
  { id: "meeting", label: "Meeting Studio", category: "Docs & Knowledge", modes: [E], kind: "internal", href: "/tools/meeting", icon: "ClipboardList", selfBuilt: true },
  { id: "gdrive", label: "Google Drive", category: "Docs & Knowledge", modes: [PR, E], kind: "external", href: "https://drive.google.com", icon: "HardDrive" },
  { id: "gdocs", label: "Google Docs", category: "Docs & Knowledge", modes: [PR, E], kind: "external", href: "https://docs.google.com", icon: "FileText" },
  { id: "confluence", label: "Confluence", category: "Docs & Knowledge", modes: [E], kind: "external", href: "https://www.atlassian.com/software/confluence", icon: "BookOpen" },
  { id: "dropbox", label: "Dropbox", category: "Docs & Knowledge", modes: [PR, E], kind: "external", href: "https://www.dropbox.com", icon: "HardDrive" },
];

export function appsForMode(mode: AppMode): AppEntry[] {
  return APPS.filter((a) => a.modes.includes(mode));
}

export function categoriesForMode(mode: AppMode): string[] {
  const seen: string[] = [];
  for (const a of appsForMode(mode)) if (!seen.includes(a.category)) seen.push(a.category);
  return seen;
}
