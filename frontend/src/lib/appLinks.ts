// Resolve a spoken/typed app-or-site name into the best URL to open.
//
// We prefer canonical HTTPS "universal links" — on iOS/Android these open the
// native app when it's installed (e.g. a youtube.com link opens the YouTube
// app), and fall back to the website otherwise. That's more reliable than
// custom scheme URLs (youtube://), which silently fail when the app is absent.
//
// Used by the assistant's `open_app` tool so "open YouTube" actually opens it.

export interface ResolvedLink { url: string; label: string }

interface AppEntry {
  label: string;
  aliases: string[];
  home: string;
  search?: (q: string) => string;
}

const enc = encodeURIComponent;

const APPS: AppEntry[] = [
  { label: "YouTube", aliases: ["youtube", "yt", "you tube"], home: "https://www.youtube.com", search: (q) => `https://www.youtube.com/results?search_query=${enc(q)}` },
  { label: "YouTube Music", aliases: ["youtube music", "yt music"], home: "https://music.youtube.com", search: (q) => `https://music.youtube.com/search?q=${enc(q)}` },
  { label: "Google", aliases: ["google", "google search"], home: "https://www.google.com", search: (q) => `https://www.google.com/search?q=${enc(q)}` },
  { label: "Google Maps", aliases: ["maps", "google maps", "map"], home: "https://maps.google.com", search: (q) => `https://www.google.com/maps/search/${enc(q)}` },
  { label: "Gmail", aliases: ["gmail", "mail", "email", "google mail"], home: "https://mail.google.com", search: (q) => `https://mail.google.com/mail/u/0/#search/${enc(q)}` },
  { label: "Google Calendar", aliases: ["calendar", "google calendar", "gcal"], home: "https://calendar.google.com" },
  { label: "Google Drive", aliases: ["drive", "google drive"], home: "https://drive.google.com", search: (q) => `https://drive.google.com/drive/search?q=${enc(q)}` },
  { label: "Google Docs", aliases: ["docs", "google docs", "doc"], home: "https://docs.google.com" },
  { label: "Google Sheets", aliases: ["sheets", "google sheets", "spreadsheet"], home: "https://sheets.google.com" },
  { label: "Spotify", aliases: ["spotify"], home: "https://open.spotify.com", search: (q) => `https://open.spotify.com/search/${enc(q)}` },
  { label: "Apple Music", aliases: ["apple music"], home: "https://music.apple.com", search: (q) => `https://music.apple.com/search?term=${enc(q)}` },
  { label: "Netflix", aliases: ["netflix"], home: "https://www.netflix.com", search: (q) => `https://www.netflix.com/search?q=${enc(q)}` },
  { label: "Prime Video", aliases: ["prime video", "amazon prime", "primevideo"], home: "https://www.primevideo.com" },
  { label: "WhatsApp", aliases: ["whatsapp", "whats app", "wa"], home: "https://web.whatsapp.com" },
  { label: "Instagram", aliases: ["instagram", "insta", "ig"], home: "https://www.instagram.com", search: (q) => `https://www.instagram.com/explore/tags/${enc(q.replace(/[^a-z0-9]/gi, ""))}` },
  { label: "X", aliases: ["twitter", "x", "tweet"], home: "https://x.com", search: (q) => `https://x.com/search?q=${enc(q)}` },
  { label: "Facebook", aliases: ["facebook", "fb"], home: "https://www.facebook.com", search: (q) => `https://www.facebook.com/search/top?q=${enc(q)}` },
  { label: "LinkedIn", aliases: ["linkedin"], home: "https://www.linkedin.com", search: (q) => `https://www.linkedin.com/search/results/all/?keywords=${enc(q)}` },
  { label: "Reddit", aliases: ["reddit"], home: "https://www.reddit.com", search: (q) => `https://www.reddit.com/search/?q=${enc(q)}` },
  { label: "GitHub", aliases: ["github", "git hub"], home: "https://github.com", search: (q) => `https://github.com/search?q=${enc(q)}` },
  { label: "ChatGPT", aliases: ["chatgpt", "chat gpt", "openai"], home: "https://chatgpt.com" },
  { label: "Wikipedia", aliases: ["wikipedia", "wiki"], home: "https://www.wikipedia.org", search: (q) => `https://en.wikipedia.org/wiki/Special:Search?search=${enc(q)}` },
  { label: "Amazon", aliases: ["amazon"], home: "https://www.amazon.com", search: (q) => `https://www.amazon.com/s?k=${enc(q)}` },
  { label: "Flipkart", aliases: ["flipkart"], home: "https://www.flipkart.com", search: (q) => `https://www.flipkart.com/search?q=${enc(q)}` },
  { label: "Zomato", aliases: ["zomato"], home: "https://www.zomato.com" },
  { label: "Swiggy", aliases: ["swiggy"], home: "https://www.swiggy.com" },
  { label: "Uber", aliases: ["uber"], home: "https://m.uber.com" },
  { label: "Zoom", aliases: ["zoom"], home: "https://zoom.us/join" },
  { label: "Google Meet", aliases: ["meet", "google meet", "gmeet"], home: "https://meet.google.com" },
  { label: "Slack", aliases: ["slack"], home: "https://app.slack.com/client" },
  { label: "Notion", aliases: ["notion"], home: "https://www.notion.so" },
  { label: "Telegram", aliases: ["telegram"], home: "https://web.telegram.org" },
];

const norm = (s: string) => (s || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

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
  let best: AppEntry | null = null;
  let bestLen = 0;
  for (const app of APPS) {
    for (const a of app.aliases) {
      if ((t === a || t.includes(a)) && a.length > bestLen) { best = app; bestLen = a.length; }
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
