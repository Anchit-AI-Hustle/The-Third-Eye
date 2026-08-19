// web/lib/content.ts
// Static product content ported from the prototype (offerings, plans, channels).
// Safe to import on client or server — no secrets.

export const OFFERINGS = [
  { i: "🎬", t: "Content Studio", d: "Plan a rolling content calendar and never stare at a blank page again." },
  { i: "📅", t: "Multi-channel Scheduler", d: "Queue posts once; publish to Instagram, YouTube, Facebook, TikTok & Google." },
  { i: "🏷️", t: "Coupon Storefront", d: "Turn your affiliate codes into a shoppable page followers can buy from." },
  { i: "🌐", t: "Marketing Website", d: "A ready-made site for awareness and to drive your commission sales." },
  { i: "📈", t: "Ad Managers & SEO", d: "Google, Meta, TikTok, print campaigns + SEO, all connected." },
  { i: "🤝", t: "Brand Marketplace", d: "Get discovered by brands and land commission deals with verified reach." },
  { i: "💰", t: "Commissions & Payouts", d: "Track affiliate earnings from your codes in one dashboard." },
  { i: "🔒", t: "Verified Identity", d: "Aadhaar-verified creators earn brand trust and higher-value deals." },
  { i: "📊", t: "Analytics", d: "See what's working across every channel and double down." },
] as const;

export const TIERS = {
  basic: {
    name: "Basic",
    monthly: 599,
    annualPM: 500,
    feats: [
      "Content calendar & scheduler",
      "Link up to 3 channels",
      "Coupon storefront",
      "Basic analytics",
      "Email support",
    ],
  },
  pro: {
    name: "Pro",
    monthly: 999,
    annualPM: 800,
    feats: [
      "Everything in Basic",
      "Unlimited channels",
      "Your own marketing website",
      "Google / Meta / TikTok ad connectors",
      "Brand marketplace access",
      "Priority support",
    ],
  },
} as const;

export const CHANNELS = [
  { k: "instagram", n: "Instagram", c: "#E1306C", ini: "IG" },
  { k: "youtube", n: "YouTube", c: "#FF0000", ini: "YT" },
  { k: "facebook", n: "Facebook", c: "#1877F2", ini: "FB" },
  { k: "tiktok", n: "TikTok", c: "#111", ini: "TT" },
  { k: "google", n: "Google", c: "#34A853", ini: "G" },
] as const;
