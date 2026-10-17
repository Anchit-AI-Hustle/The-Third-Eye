import { afterEach, describe, expect, it, vi } from "vitest";
import { cartAdd, cartRemove, cartSummary, listedPrice, productSearch, type CartItem } from "@/lib/shopping";

const rss = (items: { title: string; link: string; description: string }[]) =>
  `<rss><channel>${items.map((i) => `<item><title>${i.title}</title><link>${i.link}</link><description>${i.description}</description></item>`).join("")}</channel></rss>`;

describe("listedPrice", () => {
  it("reads the price a listing shows", () => {
    expect(listedPrice("boAt Airdopes 141 - ₹1,299 - Amazon.in")).toEqual({ amount: 1299, currency: "INR" });
    expect(listedPrice("Price: Rs. 24,999.00 only")).toEqual({ amount: 24999, currency: "INR" });
    expect(listedPrice("Sony WH-1000XM5 $348.00")).toEqual({ amount: 348, currency: "USD" });
    expect(listedPrice("No price here, 2 pack")).toBeNull();
  });
});

describe("cart", () => {
  const a: CartItem = { title: "Earbuds", url: "https://www.amazon.in/dp/B0A", price: 1299, currency: "INR", qty: 1 };
  const b: CartItem = { title: "Cable", url: "https://www.flipkart.com/p/x", qty: 2 };

  it("adding the same product again raises its quantity", () => {
    expect(cartAdd([a], { ...a, qty: 1 })).toEqual([{ ...a, qty: 2 }]);
    expect(cartAdd([a], b)).toEqual([a, b]);
  });

  it("removes by position or link", () => {
    expect(cartRemove([a, b], "2")).toEqual([a]);
    expect(cartRemove([a, b], "https://www.amazon.in/dp/B0A")).toEqual([b]);
  });

  it("totals only the prices it knows and says which it doesn't", () => {
    const s = cartSummary([a, { ...a, url: "https://www.amazon.in/dp/B0B", qty: 2 }, b]);
    expect(s).toMatch(/₹3,897/);
    expect(s).toMatch(/1 item has no listed price/);
    expect(s).toContain("https://www.flipkart.com/p/x");
  });

  it("says the cart is empty", () => {
    expect(cartSummary([])).toMatch(/empty/i);
  });
});

describe("productSearch", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("keeps only listings from the stores asked for, with their listed price", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, text: async () => rss([
      { title: "boAt Airdopes 141 Earbuds ₹1,299", link: "https://www.amazon.in/dp/B09", description: "wireless earbuds" },
      { title: "Earbuds review blog", link: "https://someblog.com/earbuds", description: "earbuds" },
      { title: "Noise Buds earbuds", link: "https://www.flipkart.com/noise-buds/p/itm1", description: "earbuds at Rs. 999" },
    ]) })));
    const hits = await productSearch("wireless earbuds");
    expect(hits.map((h) => h.url)).toEqual(["https://www.amazon.in/dp/B09", "https://www.flipkart.com/noise-buds/p/itm1"]);
    expect(hits[0]).toMatchObject({ store: "amazon.in", price: 1299, currency: "INR" });
    expect(hits[1]).toMatchObject({ store: "flipkart.com", price: 999 });
  });
});
