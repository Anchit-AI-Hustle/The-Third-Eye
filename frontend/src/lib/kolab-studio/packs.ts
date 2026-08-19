// web/lib/packs.ts
// Pack definitions: the four account types, their navigation, and the modules each ships.
// Drives the pack-aware shell (spec §2, §4–§7). Safe on client + server.

export type PackType = "creator" | "commerce" | "local" | "agency";

export const PACKS: PackType[] = ["creator", "commerce", "local", "agency"];

export interface PackMeta {
  type: PackType;
  /** The signup question answer that selects this pack (spec §2). */
  question: string;
  label: string;
  icon: string;
  blurb: string;
  /** Example verticals used only to seed defaults / benchmark peer sets — never gate features. */
  verticals: string[];
}

export const PACK_META: Record<PackType, PackMeta> = {
  creator: {
    type: "creator",
    question: "I create content",
    label: "Creator",
    icon: "🎬",
    blurb: "Influencers, athletes, educators, artists.",
    verticals: ["Lifestyle", "Fashion", "Fitness", "Food", "Tech", "Education", "Gaming", "Beauty"],
  },
  commerce: {
    type: "commerce",
    question: "I sell products",
    label: "Brand · Commerce",
    icon: "🛍️",
    blurb: "D2C & retail — fashion, footwear, beauty, F&B, electronics.",
    verticals: ["Fashion", "Footwear", "Beauty", "Packaged F&B", "Supplements", "Electronics", "Home"],
  },
  local: {
    type: "local",
    question: "I run a place people visit",
    label: "Brand · Local",
    icon: "📍",
    blurb: "Restaurants, cafés, salons, gyms, clinics, retail.",
    verticals: ["Restaurant", "Café", "Cloud kitchen", "Bar", "Salon", "Spa", "Gym", "Clinic", "Retail"],
  },
  agency: {
    type: "agency",
    question: "I manage marketing for clients",
    label: "Agency",
    icon: "🏢",
    blurb: "Agencies, creator-management firms, consultants.",
    verticals: ["Full-service", "Creator management", "Performance", "Social", "Consulting"],
  },
};

export interface NavItem {
  href: string;
  icon: string;
  label: string;
  /** false while the pack/page is still being built (spec build order §12). */
  ready?: boolean;
}

/** Per-pack navigation (spec §4–§7). Creator routes are live; brand/agency packs are in build. */
export const PACK_NAV: Record<PackType, NavItem[]> = {
  creator: [
    { href: "/home", icon: "🏠", label: "Home", ready: true },
    { href: "/studio", icon: "🎬", label: "Creator Studio", ready: true },
    { href: "/storefront", icon: "🏷️", label: "Storefront", ready: true },
    { href: "/analytics", icon: "📊", label: "Analytics", ready: true },
    { href: "/profile", icon: "👤", label: "Profile", ready: true },
    { href: "/setup", icon: "⚙️", label: "Profile Setup", ready: true },
    { href: "/subscription", icon: "💳", label: "Subscription", ready: true },
  ],
  commerce: [
    { href: "/home", icon: "🏠", label: "Dashboard", ready: true },
    { href: "/home", icon: "📣", label: "Campaigns" },
    { href: "/home", icon: "🔁", label: "Journeys" },
    { href: "/home", icon: "👥", label: "Audience" },
    { href: "/home", icon: "📦", label: "Catalog" },
    { href: "/home", icon: "🤝", label: "Creators" },
    { href: "/home", icon: "📊", label: "Analytics" },
    { href: "/home", icon: "📈", label: "Benchmark" },
  ],
  local: [
    { href: "/home", icon: "🏠", label: "Dashboard", ready: true },
    { href: "/home", icon: "📍", label: "Outlets" },
    { href: "/home", icon: "📣", label: "Campaigns" },
    { href: "/home", icon: "🔁", label: "Journeys" },
    { href: "/home", icon: "🧑‍🍳", label: "Guests" },
    { href: "/home", icon: "⭐", label: "Reputation" },
    { href: "/home", icon: "🤝", label: "Creators" },
    { href: "/home", icon: "📊", label: "Analytics" },
  ],
  agency: [
    { href: "/home", icon: "🏠", label: "Clients", ready: true },
    { href: "/home", icon: "🗂️", label: "Work" },
    { href: "/home", icon: "✅", label: "Approvals" },
    { href: "/home", icon: "📊", label: "Reporting" },
    { href: "/home", icon: "🎬", label: "Roster" },
    { href: "/home", icon: "💳", label: "Billing" },
  ],
};

/** Modules a pack ships, for the "being built" dashboard (spec §4–§7). */
export const PACK_MODULES: Record<PackType, string[]> = {
  creator: ["Strategy", "Content Calendar", "Blueprints", "Asset Map", "Scheduler", "Brand Deals", "Automation", "Tracker", "Storefront", "Media Kit"],
  commerce: ["Campaigns", "Lifecycle Journeys", "RFM Segments", "Creator Marketplace", "Catalog Sync", "Ad Audiences", "Attribution & Revenue"],
  local: ["Outlets", "Guest CRM", "Guest Journeys", "WhatsApp Campaigns", "Reputation (GBP/Zomato/Swiggy)", "Creator Collabs", "Local Presence"],
  agency: ["Client Workspaces", "Cross-client Reporting", "Approvals", "Creator Roster", "Retainer Billing", "White-label"],
};
