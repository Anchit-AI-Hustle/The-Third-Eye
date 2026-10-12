// Web search, news, stock quotes and nearby places from public endpoints that
// need no API key, so these tools answer even without SERPER_API_KEY and while
// Gemini's search grounding is out of quota.

const UA = "Mozilla/5.0 (compatible; JARVIS-OS/1.0; +https://the-third-eye.anchit-tandon.com)";
const TIMEOUT_MS = 8_000;

async function get(url: string): Promise<Response | null> {
  const r = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "en-IN,en;q=0.9" }, signal: AbortSignal.timeout(TIMEOUT_MS) }).catch(() => null);
  return r?.ok ? r : null;
}

const decode = (s: string) => s
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
  .replace(/<[^>]+>/g, "")
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
  .trim();

export function rssItems(xml: string): { title: string; link: string; description: string; pubDate: string; source: string }[] {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(([, item]) => {
    const tag = (t: string) => decode(item.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`))?.[1] ?? "");
    return { title: tag("title"), link: tag("link"), description: tag("description"), pubDate: tag("pubDate"), source: tag("source") };
  });
}

export async function freeWebSearch(query: string): Promise<string> {
  const r = await get(`https://www.bing.com/search?format=rss&q=${encodeURIComponent(query)}`);
  const items = r ? rssItems(await r.text()).slice(0, 5) : [];
  return items.map((i) => `• **${i.title}**\n  ${i.description}\n  ${i.link}`).join("\n\n");
}

export async function freeNews(query: string): Promise<string> {
  const loc = "hl=en-IN&gl=IN&ceid=IN:en";
  const url = query.trim()
    ? `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&${loc}`
    : `https://news.google.com/rss?${loc}`;
  const r = await get(url);
  const items = r ? rssItems(await r.text()).slice(0, 8) : [];
  return items.map((i) => `- **${i.title}**${i.pubDate ? ` (${new Date(i.pubDate).toUTCString().slice(0, 16)})` : ""}\n  ${i.link}`).join("\n\n");
}

async function yahooSymbol(query: string): Promise<string | null> {
  const r = await get(`https://query1.finance.yahoo.com/v1/finance/search?quotesCount=1&newsCount=0&q=${encodeURIComponent(query)}`);
  const body = r ? await r.json().catch(() => null) : null;
  return body?.quotes?.[0]?.symbol ?? null;
}

async function yahooChart(symbol: string) {
  const r = await get(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d`);
  const body = r ? await r.json().catch(() => null) : null;
  return body?.chart?.result?.[0]?.meta ?? null;
}

/** Takes a ticker ("AAPL", "RELIANCE.NS") or a company name ("Reliance"). */
export async function freeStockQuote(input: string): Promise<string> {
  const q = input.trim();
  if (!q) return "";
  let meta = /^[A-Za-z0-9.^=-]{1,15}$/.test(q) ? await yahooChart(q.toUpperCase()) : null;
  if (!meta?.regularMarketPrice) {
    const symbol = await yahooSymbol(q);
    meta = symbol ? await yahooChart(symbol) : null;
  }
  if (!meta?.regularMarketPrice) return "";
  const prev = meta.chartPreviousClose ?? meta.previousClose;
  const change = typeof prev === "number" ? meta.regularMarketPrice - prev : null;
  const pct = change !== null && prev ? (change / prev) * 100 : null;
  const when = meta.regularMarketTime ? new Date(meta.regularMarketTime * 1000).toUTCString() : "";
  return `**${meta.longName ?? meta.shortName ?? meta.symbol} (${meta.symbol})**: ${meta.regularMarketPrice} ${meta.currency ?? ""}`
    + (change !== null ? ` · ${change >= 0 ? "+" : ""}${change.toFixed(2)} (${pct!.toFixed(2)}%) vs previous close ${prev}` : "")
    + `\n${meta.fullExchangeName ?? meta.exchangeName ?? ""}${when ? ` · as of ${when}` : ""} · Yahoo Finance`;
}

const NEARBY_SPAN_DEG = 0.05;

export async function freeNearby(query: string, location?: { latitude: number; longitude: number }): Promise<string> {
  const bounds = location
    ? `&bounded=1&viewbox=${[location.longitude - NEARBY_SPAN_DEG, location.latitude + NEARBY_SPAN_DEG, location.longitude + NEARBY_SPAN_DEG, location.latitude - NEARBY_SPAN_DEG].map((n) => n.toFixed(4)).join(",")}`
    : "";
  const r = await get(`https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=0&limit=6&q=${encodeURIComponent(query)}${bounds}`);
  const places = r ? ((await r.json().catch(() => [])) as { name?: string; display_name?: string; lat?: string; lon?: string }[]) : [];
  return places.slice(0, 6).map((p) => `- **${p.name || p.display_name?.split(",")[0]}** — ${p.display_name ?? ""}\n  https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lon}`).join("\n");
}
