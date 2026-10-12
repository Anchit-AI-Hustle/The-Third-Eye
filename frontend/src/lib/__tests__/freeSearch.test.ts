import { afterEach, describe, expect, it, vi } from "vitest";
import { duckDuckGoHits, freeNearby, freeNews, freeStockQuote, freeWebSearch, relevantHits, rssItems } from "@/lib/freeSearch";

afterEach(() => vi.unstubAllGlobals());

const rss = (items: string) => `<?xml version="1.0"?><rss><channel><title>x</title>${items}</channel></rss>`;

describe("keyless search sources", () => {
  it("parses RSS items, CDATA and entities included", () => {
    const xml = rss(`<item><title><![CDATA[Rates &amp; you]]></title><link>https://a.example/1</link><description>One &lt;b&gt;two&lt;/b&gt;</description><pubDate>Mon, 12 Oct 2026 01:00:00 GMT</pubDate><source url="https://s">The Hindu</source></item>`);
    expect(rssItems(xml)).toEqual([{ title: "Rates & you", link: "https://a.example/1", description: "One <b>two</b>", pubDate: "Mon, 12 Oct 2026 01:00:00 GMT", source: "The Hindu" }]);
  });

  it("returns web results from Bing's RSS feed", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      expect(url).toContain("bing.com/search?format=rss&q=acid%20blood");
      return new Response(rss(`<item><title>Acid Blood</title><link>https://y.example</link><description>Song</description></item>`));
    }));
    expect(await freeWebSearch("acid blood")).toBe("• **Acid Blood**\n  Song\n  https://y.example");
  });

  it("reads top headlines when there is no query", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      expect(url).toBe("https://news.google.com/rss?hl=en-IN&gl=IN&ceid=IN:en");
      return new Response(rss(`<item><title>Headline - Source</title><link>https://n.example</link></item>`));
    }));
    expect(await freeNews("")).toContain("**Headline - Source**");
  });

  it("resolves a company name to a ticker and reports price and change", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("/v1/finance/search")) return new Response(JSON.stringify({ quotes: [{ symbol: "RELIANCE.NS" }] }));
      if (url.includes("/chart/RELIANCE.NS")) {
        return new Response(JSON.stringify({ chart: { result: [{ meta: { symbol: "RELIANCE.NS", longName: "Reliance Industries", regularMarketPrice: 1400, chartPreviousClose: 1386, currency: "INR", fullExchangeName: "NSE" } }] } }));
      }
      return new Response("", { status: 404 });
    }));
    const out = await freeStockQuote("Reliance Industries");
    expect(out).toContain("**Reliance Industries (RELIANCE.NS)**: 1400 INR · +14.00 (1.01%)");
  });

  it("returns nothing (so the caller falls back) when a source is down", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 503 })));
    expect(await freeWebSearch("x")).toBe("");
    expect(await freeStockQuote("AAPL")).toBe("");
    expect(await freeNearby("cafe")).toBe("");
  });

  it("bounds nearby results to the user's area", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      expect(url).toContain("bounded=1&viewbox=77.1500,28.6500,77.2500,28.5500");
      return new Response(JSON.stringify([{ name: "Blue Tokai", display_name: "Blue Tokai, Connaught Place, Delhi", lat: "28.6", lon: "77.2" }]));
    }));
    const out = await freeNearby("cafe", { latitude: 28.6, longitude: 77.2 });
    expect(out).toContain("**Blue Tokai** — Blue Tokai, Connaught Place, Delhi");
  });

  it("drops results that never mention what was searched for", () => {
    const hits = [
      { title: "Unum login", link: "https://members.unum.com/", description: "Sign in to your benefits" },
      { title: "Stripe | Financial infrastructure", link: "https://stripe.com/", description: "Payments" },
    ];
    expect(relevantHits(hits, "Stripe company overview").map((h) => h.link)).toEqual(["https://stripe.com/"]);
  });

  it("falls back to DuckDuckGo when Bing's results are off-topic", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("bing.com")) return new Response(rss(`<item><title>Unum login</title><link>https://members.unum.com/</link><description>Benefits</description></item>`));
      return new Response(`<a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fstripe.com%2Fabout&rut=x">About Stripe</a><a class="result__snippet" href="#">Stripe builds payments infrastructure</a>`);
    }));
    const out = await freeWebSearch("Stripe company overview");
    expect(out).toContain("https://stripe.com/about");
    expect(out).not.toContain("unum");
  });

  it("reads DuckDuckGo's redirect links back to the real address", () => {
    expect(duckDuckGoHits(`<a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fa.example%2Fx">A &amp; B</a> <a class="result__snippet">snip</a>`))
      .toEqual([{ title: "A & B", link: "https://a.example/x", description: "snip" }]);
  });
});
