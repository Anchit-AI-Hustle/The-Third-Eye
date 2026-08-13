// Resolve a spoken/typed app-or-site name into the best URL to open.
//
// We prefer canonical HTTPS "universal links" — on iOS/Android these open the
// native app when it's installed (e.g. a youtube.com link opens the YouTube
// app), and fall back to the website otherwise. That's more reliable than
// custom scheme URLs (youtube://), which silently fail when the app is absent.
//
// Used by the assistant's `open_app` tool so "open YouTube" actually opens it.
// Routes inside this app resolve first, so "open my tasks" goes to /tasks
// rather than out to the web.

import { APPS as APP_REGISTRY } from "@/lib/apps/registry";

export interface ResolvedLink { url: string; label: string }

interface AppEntry {
  label: string;
  aliases: string[];
  home: string;
  search?: (q: string) => string;
}

const enc = encodeURIComponent;

const APPS: AppEntry[] = [
  // ── Google Suite ──────────────────────────────────────────────────────────
  { label: "YouTube", aliases: ["youtube", "yt", "you tube"], home: "https://www.youtube.com", search: (q) => `https://www.youtube.com/results?search_query=${enc(q)}` },
  { label: "YouTube Music", aliases: ["youtube music", "yt music"], home: "https://music.youtube.com", search: (q) => `https://music.youtube.com/search?q=${enc(q)}` },
  { label: "Google", aliases: ["google", "google search"], home: "https://www.google.com", search: (q) => `https://www.google.com/search?q=${enc(q)}` },
  { label: "Google Maps", aliases: ["maps", "google maps", "map"], home: "https://maps.google.com", search: (q) => `https://www.google.com/maps/search/${enc(q)}` },
  { label: "Gmail", aliases: ["gmail", "mail", "email", "google mail"], home: "https://mail.google.com", search: (q) => `https://mail.google.com/mail/u/0/#search/${enc(q)}` },
  { label: "Google Calendar", aliases: ["calendar", "google calendar", "gcal"], home: "https://calendar.google.com" },
  { label: "Google Drive", aliases: ["drive", "google drive"], home: "https://drive.google.com", search: (q) => `https://drive.google.com/drive/search?q=${enc(q)}` },
  { label: "Google Docs", aliases: ["docs", "google docs", "doc"], home: "https://docs.google.com" },
  { label: "Google Sheets", aliases: ["sheets", "google sheets", "spreadsheet"], home: "https://sheets.google.com" },
  { label: "Google Photos", aliases: ["photos", "google photos"], home: "https://photos.google.com" },
  { label: "Google Translate", aliases: ["translate", "google translate"], home: "https://translate.google.com", search: (q) => `https://translate.google.com/?sl=auto&tl=en&text=${enc(q)}` },
  { label: "Google News", aliases: ["google news", "gnews"], home: "https://news.google.com", search: (q) => `https://news.google.com/search?q=${enc(q)}` },
  { label: "Google Scholar", aliases: ["scholar", "google scholar"], home: "https://scholar.google.com", search: (q) => `https://scholar.google.com/scholar?q=${enc(q)}` },

  // ── Music & Streaming ─────────────────────────────────────────────────────
  { label: "Spotify", aliases: ["spotify"], home: "https://open.spotify.com", search: (q) => `https://open.spotify.com/search/${enc(q)}` },
  { label: "Apple Music", aliases: ["apple music"], home: "https://music.apple.com", search: (q) => `https://music.apple.com/search?term=${enc(q)}` },
  { label: "SoundCloud", aliases: ["soundcloud", "sound cloud"], home: "https://soundcloud.com", search: (q) => `https://soundcloud.com/search?q=${enc(q)}` },
  { label: "JioSaavn", aliases: ["jiosaavn", "saavn", "jio saavn"], home: "https://www.jiosaavn.com", search: (q) => `https://www.jiosaavn.com/search/${enc(q)}` },
  { label: "Gaana", aliases: ["gaana"], home: "https://gaana.com", search: (q) => `https://gaana.com/search/${enc(q)}` },
  { label: "Wynk", aliases: ["wynk", "wynk music"], home: "https://wynk.in/music", search: (q) => `https://wynk.in/search?query=${enc(q)}` },
  { label: "Suno", aliases: ["suno", "suno ai"], home: "https://suno.com" },
  { label: "Udio", aliases: ["udio", "udio ai"], home: "https://www.udio.com" },

  // ── Video & Streaming ─────────────────────────────────────────────────────
  { label: "Netflix", aliases: ["netflix"], home: "https://www.netflix.com", search: (q) => `https://www.netflix.com/search?q=${enc(q)}` },
  { label: "Prime Video", aliases: ["prime video", "amazon prime", "primevideo"], home: "https://www.primevideo.com" },
  { label: "Hotstar", aliases: ["hotstar", "disney hotstar", "disney+"], home: "https://www.hotstar.com" },
  { label: "JioCinema", aliases: ["jiocinema", "jio cinema"], home: "https://www.jiocinema.com" },
  { label: "SonyLIV", aliases: ["sonyliv", "sony liv"], home: "https://www.sonyliv.com" },
  { label: "ZEE5", aliases: ["zee5", "zee 5"], home: "https://www.zee5.com" },
  { label: "Twitch", aliases: ["twitch"], home: "https://www.twitch.tv", search: (q) => `https://www.twitch.tv/search?term=${enc(q)}` },

  // ── Social Media ──────────────────────────────────────────────────────────
  { label: "WhatsApp", aliases: ["whatsapp", "whats app", "wa"], home: "https://web.whatsapp.com" },
  { label: "Instagram", aliases: ["instagram", "insta", "ig"], home: "https://www.instagram.com", search: (q) => `https://www.instagram.com/explore/tags/${enc(q.replace(/[^a-z0-9]/gi, ""))}` },
  { label: "X", aliases: ["twitter", "x", "tweet"], home: "https://x.com", search: (q) => `https://x.com/search?q=${enc(q)}` },
  { label: "Facebook", aliases: ["facebook", "fb"], home: "https://www.facebook.com", search: (q) => `https://www.facebook.com/search/top?q=${enc(q)}` },
  { label: "LinkedIn", aliases: ["linkedin"], home: "https://www.linkedin.com", search: (q) => `https://www.linkedin.com/search/results/all/?keywords=${enc(q)}` },
  { label: "Reddit", aliases: ["reddit"], home: "https://www.reddit.com", search: (q) => `https://www.reddit.com/search/?q=${enc(q)}` },
  { label: "Telegram", aliases: ["telegram", "tg"], home: "https://web.telegram.org" },
  { label: "Discord", aliases: ["discord"], home: "https://discord.com/app" },
  { label: "Pinterest", aliases: ["pinterest", "pin"], home: "https://www.pinterest.com", search: (q) => `https://www.pinterest.com/search/pins/?q=${enc(q)}` },
  { label: "Snapchat", aliases: ["snapchat", "snap"], home: "https://www.snapchat.com" },
  { label: "Threads", aliases: ["threads", "threads app"], home: "https://www.threads.net" },

  // ── Shopping ──────────────────────────────────────────────────────────────
  { label: "Amazon", aliases: ["amazon"], home: "https://www.amazon.com", search: (q) => `https://www.amazon.com/s?k=${enc(q)}` },
  { label: "Amazon India", aliases: ["amazon india", "amazon in"], home: "https://www.amazon.in", search: (q) => `https://www.amazon.in/s?k=${enc(q)}` },
  { label: "Flipkart", aliases: ["flipkart"], home: "https://www.flipkart.com", search: (q) => `https://www.flipkart.com/search?q=${enc(q)}` },
  { label: "Myntra", aliases: ["myntra"], home: "https://www.myntra.com", search: (q) => `https://www.myntra.com/${enc(q)}` },
  { label: "Meesho", aliases: ["meesho"], home: "https://www.meesho.com", search: (q) => `https://www.meesho.com/search?q=${enc(q)}` },
  { label: "Nykaa", aliases: ["nykaa"], home: "https://www.nykaa.com", search: (q) => `https://www.nykaa.com/search?q=${enc(q)}` },
  { label: "Ajio", aliases: ["ajio"], home: "https://www.ajio.com", search: (q) => `https://www.ajio.com/search/?text=${enc(q)}` },
  { label: "eBay", aliases: ["ebay", "e bay"], home: "https://www.ebay.com", search: (q) => `https://www.ebay.com/sch/i.html?_nkw=${enc(q)}` },
  { label: "Etsy", aliases: ["etsy"], home: "https://www.etsy.com", search: (q) => `https://www.etsy.com/search?q=${enc(q)}` },
  { label: "Decathlon", aliases: ["decathlon"], home: "https://www.decathlon.com", search: (q) => `https://www.decathlon.com/search?q=${enc(q)}` },

  // ── Food Delivery ─────────────────────────────────────────────────────────
  { label: "Zomato", aliases: ["zomato"], home: "https://www.zomato.com" },
  { label: "Swiggy", aliases: ["swiggy"], home: "https://www.swiggy.com" },
  { label: "Domino's", aliases: ["dominos", "domino's", "pizza"], home: "https://www.dominos.co.in" },
  { label: "Uber Eats", aliases: ["uber eats", "ubereats"], home: "https://www.ubereats.com" },
  { label: "DoorDash", aliases: ["doordash", "door dash"], home: "https://www.doordash.com" },
  { label: "Grubhub", aliases: ["grubhub"], home: "https://www.grubhub.com" },
  { label: "Instacart", aliases: ["instacart"], home: "https://www.instacart.com" },

  // ── Ride-Hailing & Transport ──────────────────────────────────────────────
  { label: "Uber", aliases: ["uber"], home: "https://m.uber.com" },
  { label: "Ola", aliases: ["ola", "ola cab"], home: "https://www.olacabs.com" },
  { label: "Rapido", aliases: ["rapido", "rapido bike"], home: "https://www.rapido.bike" },
  { label: "Rapido Cabs", aliases: ["rapido cab"], home: "https://www.rapido.bike" },
  { label: "BlaBlaCar", aliases: ["blablacar", "bla bla car"], home: "https://www.blablacar.com" },

  // ── Banking & Payments ────────────────────────────────────────────────────
  { label: "Google Pay", aliases: ["google pay", "gpay"], home: "https://pay.google.com" },
  { label: "PhonePe", aliases: ["phonepe", "phone pe"], home: "https://www.phonepe.com" },
  { label: "Paytm", aliases: ["paytm"], home: "https://paytm.com" },
  { label: "CRED", aliases: ["cred"], home: "https://cred.club" },
  { label: "Groww", aliases: ["groww"], home: "https://groww.in" },
  { label: "Zerodha", aliases: ["zerodha", "kite"], home: "https://zerodha.com" },
  { label: "Upstox", aliases: ["upstox"], home: "https://upstox.com" },
  { label: "Coinbase", aliases: ["coinbase"], home: "https://www.coinbase.com" },
  { label: "Binance", aliases: ["binance"], home: "https://www.binance.com" },

  // ── Productivity & Collaboration ──────────────────────────────────────────
  { label: "Notion", aliases: ["notion"], home: "https://www.notion.so", search: (q) => `https://www.notion.so/search?q=${enc(q)}` },
  { label: "Slack", aliases: ["slack"], home: "https://app.slack.com/client" },
  { label: "Zoom", aliases: ["zoom"], home: "https://zoom.us/join" },
  { label: "Google Meet", aliases: ["meet", "google meet", "gmeet"], home: "https://meet.google.com" },
  { label: "Microsoft Teams", aliases: ["teams", "microsoft teams"], home: "https://teams.microsoft.com" },
  { label: "Trello", aliases: ["trello"], home: "https://trello.com" },
  { label: "Asana", aliases: ["asana"], home: "https://app.asana.com" },
  { label: "Monday", aliases: ["monday", "monday.com"], home: "https://monday.com" },
  { label: "ClickUp", aliases: ["clickup", "click up"], home: "https://clickup.com" },
  { label: "Todoist", aliases: ["todoist"], home: "https://todoist.com" },
  { label: "Obsidian", aliases: ["obsidian", "obsidian md"], home: "https://obsidian.md" },
  { label: "Canva", aliases: ["canva"], home: "https://www.canva.com", search: (q) => `https://www.canva.com/search?q=${enc(q)}` },
  { label: "Figma", aliases: ["figma"], home: "https://www.figma.com" },
  { label: "Miro", aliases: ["miro", "miro board"], home: "https://miro.com" },
  { label: "Loom", aliases: ["loom", "loom video"], home: "https://www.loom.com" },

  // ── Developer Tools ───────────────────────────────────────────────────────
  { label: "GitHub", aliases: ["github", "git hub"], home: "https://github.com", search: (q) => `https://github.com/search?q=${enc(q)}` },
  { label: "GitLab", aliases: ["gitlab", "git lab"], home: "https://gitlab.com", search: (q) => `https://gitlab.com/search?search=${enc(q)}` },
  { label: "Stack Overflow", aliases: ["stackoverflow", "stack overflow"], home: "https://stackoverflow.com", search: (q) => `https://stackoverflow.com/search?q=${enc(q)}` },
  { label: "Vercel", aliases: ["vercel"], home: "https://vercel.com" },
  { label: "Netlify", aliases: ["netlify"], home: "https://www.netlify.com" },
  { label: "Railway", aliases: ["railway", "railway.app"], home: "https://railway.app" },
  { label: "Replit", aliases: ["replit"], home: "https://replit.com", search: (q) => `https://replit.com/search?q=${enc(q)}` },
  { label: "CodePen", aliases: ["codepen"], home: "https://codepen.io", search: (q) => `https://codepen.io/search/pens?q=${enc(q)}` },
  { label: "NPM", aliases: ["npm", "npmjs"], home: "https://www.npmjs.com", search: (q) => `https://www.npmjs.com/search?q=${enc(q)}` },
  { label: "PyPI", aliases: ["pypi"], home: "https://pypi.org", search: (q) => `https://pypi.org/search/?q=${enc(q)}` },
  { label: "Docker Hub", aliases: ["docker hub", "dockerhub"], home: "https://hub.docker.com", search: (q) => `https://hub.docker.com/search?q=${enc(q)}` },
  { label: "Supabase", aliases: ["supabase"], home: "https://supabase.com" },
  { label: "Firebase", aliases: ["firebase"], home: "https://firebase.google.com" },
  { label: "Postman", aliases: ["postman"], home: "https://www.postman.com" },
  { label: "Jupyter", aliases: ["jupyter", "jupyter notebook"], home: "https://jupyter.org" },

  // ── AI & Research ─────────────────────────────────────────────────────────
  { label: "ChatGPT", aliases: ["chatgpt", "chat gpt", "openai"], home: "https://chatgpt.com" },
  { label: "Claude", aliases: ["claude", "claude ai", "anthropic"], home: "https://claude.ai" },
  { label: "Gemini", aliases: ["gemini", "google gemini", "bard"], home: "https://gemini.google.com" },
  { label: "Perplexity", aliases: ["perplexity", "perplexity ai"], home: "https://www.perplexity.ai", search: (q) => `https://www.perplexity.ai/search?q=${enc(q)}` },
  { label: "Hugging Face", aliases: ["huggingface", "hugging face", "hf"], home: "https://huggingface.co", search: (q) => `https://huggingface.co/models?search=${enc(q)}` },
  { label: "Midjourney", aliases: ["midjourney"], home: "https://www.midjourney.com" },
  { label: "DALL-E", aliases: ["dalle", "dall-e", "dall e"], home: "https://chatgpt.com" },
  { label: "ElevenLabs", aliases: ["elevenlabs", "eleven labs"], home: "https://elevenlabs.io" },

  // ── Reference & Knowledge ─────────────────────────────────────────────────
  { label: "Wikipedia", aliases: ["wikipedia", "wiki"], home: "https://www.wikipedia.org", search: (q) => `https://en.wikipedia.org/wiki/Special:Search?search=${enc(q)}` },
  { label: "Medium", aliases: ["medium"], home: "https://medium.com", search: (q) => `https://medium.com/search?q=${enc(q)}` },
  { label: "Dev.to", aliases: ["dev.to", "devto"], home: "https://dev.to", search: (q) => `https://dev.to/search?q=${enc(q)}` },
  { label: "MDN", aliases: ["mdn", "mozilla", "mdn web docs"], home: "https://developer.mozilla.org", search: (q) => `https://developer.mozilla.org/search?q=${enc(q)}` },
  { label: "arXiv", aliases: ["arxiv", "arxiv.org"], home: "https://arxiv.org", search: (q) => `https://arxiv.org/search/?query=${enc(q)}` },
  { label: "Google Scholar", aliases: ["scholar", "google scholar"], home: "https://scholar.google.com", search: (q) => `https://scholar.google.com/scholar?q=${enc(q)}` },

  // ── Health & Fitness ──────────────────────────────────────────────────────
  { label: "Practo", aliases: ["practo"], home: "https://www.practo.com" },
  { label: "Apollo 24|7", aliases: ["apollo", "apollo 247"], home: "https://www.apollo247.com" },
  { label: "1mg", aliases: ["1mg", "tata 1mg"], home: "https://www.1mg.com", search: (q) => `https://www.1mg.com/search/all?name=${enc(q)}` },
  { label: "Cult.fit", aliases: ["cultfit", "cult fit"], home: "https://www.cult.fit" },
  { label: "Nike Run Club", aliases: ["nike run", "nrc"], home: "https://www.nike.com/nrc-app" },
  { label: "Strava", aliases: ["strava"], home: "https://www.strava.com" },
  { label: "MyFitnessPal", aliases: ["myfitnesspal", "fitnesspal"], home: "https://www.myfitnesspal.com" },
  { label: "HealthifyMe", aliases: ["healthifyme", "healthify"], home: "https://www.healthifyme.com" },

  // ── Travel & Navigation ───────────────────────────────────────────────────
  { label: "MakeMyTrip", aliases: ["makemytrip", "make my trip"], home: "https://www.makemytrip.com" },
  { label: "Goibibo", aliases: ["goibibo"], home: "https://www.goibibo.com" },
  { label: "Booking.com", aliases: ["booking", "booking.com"], home: "https://www.booking.com", search: (q) => `https://www.booking.com/search.html?ss=${enc(q)}` },
  { label: "Airbnb", aliases: ["airbnb"], home: "https://www.airbnb.com", search: (q) => `https://www.airbnb.com/s/${enc(q)}` },
  { label: "Trip.com", aliases: ["trip.com", "tripcom"], home: "https://www.trip.com" },
  { label: "IRCTC", aliases: ["irctc", "train ticket"], home: "https://www.irctc.co.in/nget/train-search" },
  { label: "Google Flights", aliases: ["flights", "google flights"], home: "https://www.google.com/travel/flights" },
  { label: "Rome2Rio", aliases: ["rome2rio"], home: "https://www.rome2rio.com" },

  // ── News & Reading ────────────────────────────────────────────────────────
  { label: "Times of India", aliases: ["times of india", "toi"], home: "https://timesofindia.indiatimes.com" },
  { label: "Hacker News", aliases: ["hacker news", "hn", "ycombinator"], home: "https://news.ycombinator.com", search: (q) => `https://hn.algolia.com/?q=${enc(q)}` },
  { label: "Product Hunt", aliases: ["product hunt", "producthunt"], home: "https://www.producthunt.com", search: (q) => `https://www.producthunt.com/search?q=${enc(q)}` },
  { label: "Substack", aliases: ["substack"], home: "https://substack.com", search: (q) => `https://substack.com/search/${enc(q)}` },

  // ── Entertainment & Gaming ────────────────────────────────────────────────
  { label: "Steam", aliases: ["steam", "steam store"], home: "https://store.steampowered.com", search: (q) => `https://store.steampowered.com/search/?term=${enc(q)}` },
  { label: "Epic Games", aliases: ["epic games", "epic store"], home: "https://store.epicgames.com" },
  { label: "IMDb", aliases: ["imdb"], home: "https://www.imdb.com", search: (q) => `https://www.imdb.com/find/?q=${enc(q)}` },
  { label: "Letterboxd", aliases: ["letterboxd"], home: "https://letterboxd.com", search: (q) => `https://letterboxd.com/search/films/${enc(q)}` },
  { label: "Goodreads", aliases: ["goodreads"], home: "https://www.goodreads.com", search: (q) => `https://www.goodreads.com/search?q=${enc(q)}` },
  { label: "Spotify Charts", aliases: ["spotify charts", "charts"], home: "https://charts.spotify.com" },

  // ── Learning & Education ──────────────────────────────────────────────────
  { label: "Coursera", aliases: ["coursera"], home: "https://www.coursera.org", search: (q) => `https://www.coursera.org/search?query=${enc(q)}` },
  { label: "Udemy", aliases: ["udemy"], home: "https://www.udemy.com", search: (q) => `https://www.udemy.com/courses/search/?q=${enc(q)}` },
  { label: "Khan Academy", aliases: ["khan academy", "khan"], home: "https://www.khanacademy.org" },
  { label: "edX", aliases: ["edx", "ed x"], home: "https://www.edx.org", search: (q) => `https://www.edx.org/search?q=${enc(q)}` },
  { label: "LeetCode", aliases: ["leetcode"], home: "https://leetcode.com", search: (q) => `https://leetcode.com/problemset/all/?search=${enc(q)}` },
  { label: "freeCodeCamp", aliases: ["freecodecamp", "fcc"], home: "https://www.freecodecamp.org" },
  { label: "Brilliant", aliases: ["brilliant", "brilliant.org"], home: "https://brilliant.org" },
  { label: "Duolingo", aliases: ["duolingo"], home: "https://www.duolingo.com" },
];

const norm = (s: string) => (s || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

// The user's own apps, derived from the App Hub registry so there is one place
// to add an app rather than two that drift. Without these, "open my tasks"
// matched nothing and fell through to a Google search — the assistant sent you
// out of the product to look for a feature the product already has.
const INTERNAL: AppEntry[] = APP_REGISTRY
  .filter((a) => a.kind === "internal")
  .map((a) => {
    const label = norm(a.label);
    const id = norm(a.id.replace(/-/g, " "));
    return {
      label: a.label,
      aliases: Array.from(new Set([label, id, `my ${label}`, `${label} page`])),
      home: a.href,
    };
  });

/**
 * Whole-word alias match.
 *
 * This used to be `target.includes(alias)`, which matched any substring: "ola"
 * sits inside "k(ola)b" so asking for Kolab opened a cab service, and "udio"
 * sits inside "st(udio)" so the Music Studio opened a rival music generator.
 */
function aliasMatches(target: string, alias: string): boolean {
  if (target === alias) return true;
  const words = target.split(" ");
  const aliasWords = alias.split(" ");
  for (let i = 0; i + aliasWords.length <= words.length; i++) {
    if (aliasWords.every((w, j) => words[i + j] === w)) return true;
  }
  return false;
}

/** True when the resolved link is a route inside this app rather than the web. */
export function isInternalLink(url: string): boolean {
  return url.startsWith("/");
}

/**
 * Resolve a target ("YouTube", "youtube.com", "https://…") + optional query
 * into a URL to open. Always returns something sensible — an unrecognised
 * target falls back to a Google search so "open X" never dead-ends.
 */
export function resolveAppLink(targetRaw: string, query?: string): ResolvedLink {
  const raw = (targetRaw || "").trim();
  const q = (query || "").trim();

  // Already a full URL → open as-is.
  if (/^https?:\/\//i.test(raw)) return { url: raw, label: raw.replace(/^https?:\/\//, "").replace(/\/$/, "") };

  const t = norm(raw);

  // Known app/site by alias (longest alias match wins for specificity).
  // The user's own apps are searched first: when a name is ambiguous, the thing
  // they already have inside the product should win over a website.
  let best: AppEntry | null = null;
  let bestLen = 0;
  for (const app of [...INTERNAL, ...APPS]) {
    for (const a of app.aliases) {
      if (aliasMatches(t, a) && a.length > bestLen) { best = app; bestLen = a.length; }
    }
  }
  if (best) {
    if (q && best.search) return { url: best.search(q), label: `${best.label} — ${q}` };
    return { url: best.home, label: best.label };
  }

  // Bare domain like "example.com" or "sub.site.co.uk/path".
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(raw)) {
    return { url: `https://${raw}`, label: raw };
  }

  // Unknown target → Google search so the request still does something useful.
  const term = q || raw;
  return { url: `https://www.google.com/search?q=${enc(term)}`, label: `Search: ${term}` };
}
