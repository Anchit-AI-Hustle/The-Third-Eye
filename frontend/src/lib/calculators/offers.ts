// Affiliate offers — the highest revenue-per-visitor stream on the calculators.
//
// Each calculator page carries `offerTags` (see ./data.ts). Any offer sharing a
// tag renders on that page, matched to intent (loan pages → loan offers, SIP
// pages → broker offers), which is what makes the conversion rate high.
//
// TO TURN AN OFFER ON:
//   1. Join the affiliate programme, get your tracking URL.
//   2. Paste it into `url` and set `enabled: true`.
//   3. Rebuild/redeploy.
// Offers with enabled:false or an empty url never render — you can't ship a
// dead affiliate link by accident.
//
// NON-NEGOTIABLE: every outbound offer link renders rel="sponsored noopener"
// (Google requires it for paid links) and a disclosure line sits above the
// block (FTC/ASCI). See OfferCard.tsx — do not remove either.

export interface Offer {
  id: string;
  tags: string[];
  enabled: boolean;
  headline: string;
  body: string;
  cta: string;
  url: string;
  footnote?: string;
}

export const offers: Offer[] = [
  {
    id: "demat-account",
    tags: ["investing", "demat"],
    enabled: false,
    headline: "Open a free demat account",
    body: "Zero account-opening charge and no annual maintenance on the basic plan. About 10 minutes with Aadhaar and PAN.",
    cta: "Open an account",
    url: "", // ← your broker affiliate link (Zerodha, Groww, Upstox, Angel One…)
    footnote: "Investments in securities are subject to market risk.",
  },
  {
    id: "mutual-fund-platform",
    tags: ["investing"],
    enabled: false,
    headline: "Start a SIP with zero commission",
    body: "Direct mutual funds — no distributor commission eating your returns. Over 20 years the cost difference typically runs into lakhs.",
    cta: "Start investing",
    url: "",
    footnote: "Read all scheme-related documents carefully.",
  },
  {
    id: "home-loan",
    tags: ["homeloan", "loans"],
    enabled: false,
    headline: "Compare home loan rates",
    body: "Check offers from multiple lenders at once. A 0.5% lower rate on a ₹50 lakh loan saves around ₹6 lakh over 20 years.",
    cta: "Compare rates",
    url: "",
    footnote: "Rates depend on your credit profile and lender approval.",
  },
  {
    id: "personal-loan",
    tags: ["loans", "debt"],
    enabled: false,
    headline: "Personal loan at a lower rate than your card",
    body: "Carrying a card balance at 40%+? A personal loan at 11–16% cuts the interest sharply and gives you a fixed end date.",
    cta: "Check your rate",
    url: "",
    footnote: "Borrow only what you can repay. Check the processing fee first.",
  },
  {
    id: "credit-card",
    tags: ["creditcard", "debt"],
    enabled: false,
    headline: "Find a card that fits how you spend",
    body: "Compare cashback, fuel and travel cards side by side. The right card on your existing spending is free money.",
    cta: "Compare cards",
    url: "",
    footnote: "Only useful if you clear the balance in full each month.",
  },
  {
    id: "term-insurance",
    tags: ["insurance"],
    enabled: false,
    headline: "Term insurance from around ₹500 a month",
    body: "Pure protection, no investment component — the cheapest way to protect a corpus you haven't finished building.",
    cta: "Get a quote",
    url: "",
    footnote: "Premium depends on age, health and cover amount.",
  },
  {
    id: "health-insurance",
    tags: ["insurance", "savings"],
    enabled: false,
    headline: "Health cover before you need it",
    body: "A single hospital stay is the most common reason emergency funds get wiped out. Cover is far cheaper bought young and healthy.",
    cta: "Compare plans",
    url: "",
    footnote: "Check the waiting period for pre-existing conditions.",
  },
  {
    id: "high-yield-savings",
    tags: ["savings", "banking"],
    enabled: false,
    headline: "Park your emergency fund somewhere it earns",
    body: "Small finance banks and sweep-in accounts pay noticeably more than a standard savings account, with the same instant access.",
    cta: "See rates",
    url: "",
    footnote: "Deposits are insured up to ₹5 lakh per bank.",
  },
  {
    id: "freelance-tools",
    tags: ["freelance", "business"],
    enabled: false,
    headline: "Invoicing and payments for freelancers",
    body: "Send professional invoices, accept international payments, and keep tax paperwork ready without doing it by hand.",
    cta: "Try it free",
    url: "",
    footnote: "Free tier available.",
  },
  {
    id: "accounting-software",
    tags: ["business", "freelance"],
    enabled: false,
    headline: "Books that stay clean",
    body: "Track income, expenses and GST automatically instead of reconstructing the year in March.",
    cta: "Start free trial",
    url: "",
  },
];

/** Offers relevant to a page, filtered to the ones actually ready to ship. */
export function offersFor(tags: string[] = [], limit = 2): Offer[] {
  return offers
    .filter((o) => o.enabled && o.url && o.tags.some((t) => tags.includes(t)))
    .slice(0, limit);
}
