// Registry for the Studio — three mode-bound studios, each with relevant tools
// and category-appropriate inputs. Shared by the client (renders form + preview)
// and the server route (validates + builds the prompt). Framework-free.

export type ModeId = "personal" | "professional" | "enterprise";
export type OutputFormat = "html" | "markdown";
export type FieldType = "text" | "textarea" | "select";

export interface ToolField {
  name: string;
  label: string;
  type: FieldType;
  placeholder?: string;
  options?: string[];
  required?: boolean;
}

export interface StudioTool {
  id: string;
  label: string;
  mode: ModeId;
  icon: string;
  accent: string;
  blurb: string;
  format: OutputFormat;
  downloadExt: string;
  cta: string;
  fields: ToolField[];
}

// The three studios, one per mode.
export const STUDIOS: Record<ModeId, { name: string; tagline: string; accent: string; icon: string }> = {
  personal:     { name: "Hobby Studio",   tagline: "Create for the joy of it — music, writing, plans", accent: "#34D399", icon: "Palette" },
  professional: { name: "Startup Studio", tagline: "Ship growth assets — pages, mailers, decks, ads",   accent: "#4FC3F7", icon: "Rocket" },
  enterprise:   { name: "Office Studio",  tagline: "Run the org — lifecycle, reports, meetings, SOPs",  accent: "#A78BFA", icon: "Building2" },
};

const P = "#4FC3F7", E = "#A78BFA", H = "#34D399";

export const STUDIO_TOOLS: StudioTool[] = [
  // ── Hobby Studio (Personal) ──────────────────────────────────────────────
  {
    id: "music", label: "Music Studio", mode: "personal", icon: "Music", accent: H,
    blurb: "Generate actual music — a playable, downloadable audio track — from a description. Instrumental or with AI vocals + lyrics.",
    format: "markdown", downloadExt: "mp3", cta: "Generate music", fields: [],
  },
  {
    id: "creative", label: "Creative Studio", mode: "personal", icon: "PenLine", accent: "#F0C94E",
    blurb: "Text-only creative: song lyrics, a music-gen prompt, poems, or social captions.",
    format: "markdown", downloadExt: "md", cta: "Create",
    fields: [
      { name: "brief", label: "Your idea", type: "textarea", placeholder: "Theme, mood, story, occasion…", required: true },
      { name: "format", label: "What to create", type: "select", options: ["Song lyrics", "Music-gen prompt (Suno/Udio)", "Poem", "Social caption set"] },
      { name: "vibe", label: "Genre / vibe", type: "text", placeholder: "e.g. lo-fi acoustic, upbeat pop" },
    ],
  },
  {
    id: "travel", label: "Trip Planner", mode: "personal", icon: "Plane", accent: H,
    blurb: "A day-by-day travel itinerary tuned to your dates, budget, and interests.",
    format: "markdown", downloadExt: "md", cta: "Plan trip",
    fields: [
      { name: "destination", label: "Destination", type: "text", placeholder: "e.g. Tokyo", required: true },
      { name: "days", label: "Days & dates", type: "text", placeholder: "e.g. 5 days in October" },
      { name: "travellers", label: "Who's going", type: "text", placeholder: "e.g. couple, with kids, solo" },
      { name: "budget", label: "Budget", type: "select", options: ["Shoestring", "Mid-range", "Comfortable", "Luxury"] },
      { name: "interests", label: "Interests", type: "textarea", placeholder: "food, hikes, museums, nightlife…" },
    ],
  },
  {
    id: "recipe", label: "Recipe & Meal Studio", mode: "personal", icon: "ChefHat", accent: H,
    blurb: "Recipes or a weekly meal plan from ingredients, diet, and time you have.",
    format: "markdown", downloadExt: "md", cta: "Cook up ideas",
    fields: [
      { name: "goal", label: "What do you want", type: "select", options: ["A single recipe", "A weekly meal plan", "Use up my ingredients"] },
      { name: "ingredients", label: "Ingredients / cuisine", type: "textarea", placeholder: "e.g. paneer, spinach, tomatoes — North Indian", required: true },
      { name: "diet", label: "Diet / constraints", type: "text", placeholder: "e.g. vegetarian, high-protein, 30-min" },
      { name: "servings", label: "Servings", type: "text", placeholder: "e.g. 2" },
    ],
  },

  {
    id: "workout", label: "Fitness Planner", mode: "personal", icon: "Dumbbell", accent: H,
    blurb: "A personalized weekly workout plan matched to your goal, level, and available equipment.",
    format: "markdown", downloadExt: "md", cta: "Build my plan",
    fields: [
      { name: "goal", label: "Goal", type: "select", options: ["Build muscle", "Lose fat", "Get stronger", "General fitness", "Endurance"] },
      { name: "level", label: "Experience", type: "select", options: ["Beginner", "Intermediate", "Advanced"] },
      { name: "days", label: "Days per week & time", type: "text", placeholder: "e.g. 4 days, 45 min", required: true },
      { name: "equipment", label: "Equipment / setting", type: "text", placeholder: "e.g. home dumbbells, full gym, bodyweight" },
      { name: "notes", label: "Constraints / preferences", type: "textarea", placeholder: "injuries, dislikes, focus areas…" },
    ],
  },
  {
    id: "study", label: "Study Coach", mode: "personal", icon: "GraduationCap", accent: H,
    blurb: "A structured study plan or learning path for any subject, tuned to your timeline.",
    format: "markdown", downloadExt: "md", cta: "Plan my learning",
    fields: [
      { name: "subject", label: "Subject / skill", type: "text", placeholder: "e.g. Spanish, calculus, guitar", required: true },
      { name: "level", label: "Current level", type: "text", placeholder: "e.g. complete beginner" },
      { name: "timeline", label: "Timeline & hours/week", type: "text", placeholder: "e.g. 8 weeks, 5 hrs/week", required: true },
      { name: "goal", label: "Target outcome", type: "textarea", placeholder: "What you want to be able to do…" },
    ],
  },
  {
    id: "journal", label: "Journal & Reflection", mode: "personal", icon: "NotebookPen", accent: "#F0C94E",
    blurb: "Guided journaling prompts or a reflective entry from your thoughts and mood.",
    format: "markdown", downloadExt: "md", cta: "Reflect",
    fields: [
      { name: "want", label: "What do you want", type: "select", options: ["Journaling prompts for today", "Turn my notes into a reflection", "Weekly review", "Gratitude list"] },
      { name: "context", label: "What's on your mind", type: "textarea", placeholder: "How you're feeling, what happened, what's ahead…", required: true },
      { name: "focus", label: "Focus (optional)", type: "text", placeholder: "e.g. work stress, relationships, goals" },
    ],
  },
  {
    id: "budget", label: "Budget Planner", mode: "personal", icon: "Wallet", accent: H,
    blurb: "A simple personal monthly budget with category splits and savings tips.",
    format: "markdown", downloadExt: "md", cta: "Plan my budget",
    fields: [
      { name: "income", label: "Monthly income", type: "text", placeholder: "e.g. ₹90,000 take-home", required: true },
      { name: "fixed", label: "Fixed costs", type: "textarea", placeholder: "rent, EMIs, subscriptions…" },
      { name: "goals", label: "Savings / goals", type: "text", placeholder: "e.g. save 20%, trip fund" },
      { name: "notes", label: "Anything else", type: "textarea", placeholder: "debts, dependents, priorities…" },
    ],
  },

  {
    id: "social-media", label: "Social Media Studio", mode: "personal", icon: "Share2", accent: "#F0C94E",
    blurb: "Platform-ready posts, captions, and hooks for Instagram, TikTok, YouTube, or LinkedIn.",
    format: "markdown", downloadExt: "md", cta: "Create posts",
    fields: [
      { name: "topic", label: "Topic / idea", type: "textarea", placeholder: "What's the post about? goal, vibe, offer…", required: true },
      { name: "platform", label: "Platform", type: "select", options: ["Instagram", "TikTok", "YouTube", "LinkedIn", "X / Twitter", "Multi-platform"] },
      { name: "count", label: "How many", type: "select", options: ["1 post", "A set of 5", "A week of posts"] },
      { name: "tone", label: "Tone", type: "text", placeholder: "e.g. playful, aspirational, educational" },
    ],
  },
  {
    id: "video", label: "OTT / Video Studio", mode: "personal", icon: "Clapperboard", accent: "#F0C94E",
    blurb: "Video scripts and outlines — short-form reels, YouTube episodes, or an OTT series concept.",
    format: "markdown", downloadExt: "md", cta: "Write script",
    fields: [
      { name: "concept", label: "Concept", type: "textarea", placeholder: "The story, topic, or hook…", required: true },
      { name: "format", label: "Format", type: "select", options: ["Short-form reel (15-60s)", "YouTube video (5-10 min)", "OTT / series concept", "Explainer"] },
      { name: "audience", label: "Audience", type: "text", placeholder: "who it's for" },
      { name: "tone", label: "Tone / style", type: "text", placeholder: "e.g. cinematic, casual, dramatic" },
    ],
  },

  // ── Startup Studio (Professional) ────────────────────────────────────────
  {
    id: "landing", label: "Landing Page Engine", mode: "professional", icon: "LayoutTemplate", accent: P,
    blurb: "A complete, responsive HTML landing page from a product brief — preview, copy, or ship.",
    format: "html", downloadExt: "html", cta: "Generate landing page",
    fields: [
      { name: "product", label: "Product / brand", type: "text", placeholder: "e.g. Vahdam Turmeric Latte", required: true },
      { name: "brief", label: "What it is & why it's great", type: "textarea", placeholder: "The offer, key benefits, proof points…", required: true },
      { name: "audience", label: "Target audience", type: "text", placeholder: "e.g. wellness-focused millennials" },
      { name: "cta", label: "Primary CTA", type: "text", placeholder: "e.g. Shop now – 20% off" },
      { name: "tone", label: "Tone", type: "select", options: ["Premium & minimal", "Warm & wellness", "Bold & punchy", "Editorial"] },
    ],
  },
  {
    id: "mailer", label: "HTML Mailer Architect", mode: "professional", icon: "Mail", accent: P,
    blurb: "An email-client-safe, table-based HTML mailer — inline styles, mobile-friendly.",
    format: "html", downloadExt: "html", cta: "Generate mailer",
    fields: [
      { name: "campaign", label: "Campaign goal", type: "text", placeholder: "e.g. Diwali gifting launch", required: true },
      { name: "message", label: "Key message & offer", type: "textarea", placeholder: "Offer, hero product, urgency…", required: true },
      { name: "subject", label: "Subject line direction", type: "text", placeholder: "e.g. playful, curiosity-driven" },
      { name: "cta", label: "Call-to-action", type: "text", placeholder: "e.g. Shop the gift edit" },
      { name: "tone", label: "Tone", type: "select", options: ["Premium & minimal", "Warm & wellness", "Festive & urgent", "Editorial"] },
    ],
  },
  {
    id: "pitch", label: "Pitch Deck Outliner", mode: "professional", icon: "Presentation", accent: P,
    blurb: "A slide-by-slide investor/sales pitch outline with the narrative and key numbers.",
    format: "markdown", downloadExt: "md", cta: "Outline deck",
    fields: [
      { name: "company", label: "Company / product", type: "text", placeholder: "e.g. The Third Eye", required: true },
      { name: "context", label: "What it does & traction", type: "textarea", placeholder: "Problem, solution, market, traction, ask…", required: true },
      { name: "audience", label: "Deck for", type: "select", options: ["Seed investors", "Series A", "Sales / enterprise", "Internal buy-in"] },
      { name: "raise", label: "Ask (if any)", type: "text", placeholder: "e.g. raising $1.5M seed" },
    ],
  },
  {
    id: "adcopy", label: "Ad Copy Studio", mode: "professional", icon: "Megaphone", accent: P,
    blurb: "Performance ad copy — hooks, primary text, headlines and CTAs — per channel.",
    format: "markdown", downloadExt: "md", cta: "Write ads",
    fields: [
      { name: "product", label: "Product / offer", type: "text", placeholder: "e.g. Vahdam Chai sampler", required: true },
      { name: "angle", label: "Angle / benefit", type: "textarea", placeholder: "What to lead with, audience, offer…", required: true },
      { name: "channel", label: "Channel", type: "select", options: ["Meta (FB/IG)", "Google Search", "TikTok", "Email subject lines"] },
      { name: "tone", label: "Tone", type: "text", placeholder: "e.g. playful, premium, urgent" },
    ],
  },

  {
    id: "blog", label: "SEO Blog Writer", mode: "professional", icon: "Newspaper", accent: P,
    blurb: "A complete, SEO-structured blog article with title options, headings, and a meta description.",
    format: "markdown", downloadExt: "md", cta: "Write article",
    fields: [
      { name: "topic", label: "Topic / working title", type: "text", placeholder: "e.g. Benefits of turmeric tea", required: true },
      { name: "keyword", label: "Primary keyword", type: "text", placeholder: "e.g. turmeric tea benefits" },
      { name: "audience", label: "Audience & intent", type: "textarea", placeholder: "Who's reading and what they want…", required: true },
      { name: "length", label: "Length", type: "select", options: ["Short (~600w)", "Standard (~1200w)", "In-depth (~2000w)"] },
      { name: "tone", label: "Tone", type: "select", options: ["Helpful & warm", "Authoritative", "Playful", "Editorial"] },
    ],
  },
  {
    id: "social", label: "Social Content Calendar", mode: "professional", icon: "CalendarDays", accent: P,
    blurb: "A ready-to-post content calendar — hooks, captions, and formats across a week or month.",
    format: "markdown", downloadExt: "md", cta: "Build calendar",
    fields: [
      { name: "brand", label: "Brand / product", type: "text", placeholder: "e.g. Vahdam India", required: true },
      { name: "goal", label: "Goal & themes", type: "textarea", placeholder: "e.g. drive Diwali gifting, educate on wellness…", required: true },
      { name: "platforms", label: "Platforms", type: "text", placeholder: "e.g. Instagram, LinkedIn" },
      { name: "cadence", label: "Timeframe", type: "select", options: ["1 week", "2 weeks", "1 month"] },
    ],
  },
  {
    id: "outreach", label: "Cold Outreach", mode: "professional", icon: "Send", accent: P,
    blurb: "A multi-step cold email / DM sequence with follow-ups that actually get replies.",
    format: "markdown", downloadExt: "md", cta: "Write sequence",
    fields: [
      { name: "offer", label: "What you're offering", type: "textarea", placeholder: "Product/service, key value, proof…", required: true },
      { name: "target", label: "Who you're targeting", type: "text", placeholder: "e.g. D2C founders, marketing heads", required: true },
      { name: "channel", label: "Channel", type: "select", options: ["Cold email", "LinkedIn DM", "Both"] },
      { name: "steps", label: "Sequence length", type: "select", options: ["3 touches", "4 touches", "5 touches"] },
    ],
  },
  {
    id: "naming", label: "Naming & Tagline", mode: "professional", icon: "Tag", accent: P,
    blurb: "Brandable name ideas and taglines for a product, feature, or campaign — with rationale.",
    format: "markdown", downloadExt: "md", cta: "Generate names",
    fields: [
      { name: "what", label: "What are we naming", type: "text", placeholder: "e.g. a new cold-brew tea line", required: true },
      { name: "context", label: "Positioning & vibe", type: "textarea", placeholder: "Audience, feel, differentiators…", required: true },
      { name: "type", label: "What to produce", type: "select", options: ["Names + taglines", "Names only", "Taglines only"] },
      { name: "avoid", label: "Avoid / must-have", type: "text", placeholder: "e.g. avoid 'zen', must feel premium" },
    ],
  },

  {
    id: "campaign", label: "Campaign Planner", mode: "professional", icon: "TrendingUp", accent: P,
    blurb: "A full multi-channel marketing campaign plan — angles, channels, timeline, budget split, and KPIs.",
    format: "markdown", downloadExt: "md", cta: "Plan campaign",
    fields: [
      { name: "product", label: "Product / offer", type: "text", placeholder: "e.g. Vahdam Diwali gifting", required: true },
      { name: "objective", label: "Objective & context", type: "textarea", placeholder: "Goal, audience, timing, budget, constraints…", required: true },
      { name: "channels", label: "Channels", type: "text", placeholder: "e.g. Meta, Google, email, influencers" },
      { name: "duration", label: "Duration", type: "select", options: ["1 week", "2 weeks", "1 month", "Quarter"] },
    ],
  },

  // ── Office Studio (Enterprise) ───────────────────────────────────────────
  {
    id: "lifecycle", label: "Lifecycle OS", mode: "enterprise", icon: "Workflow", accent: E,
    blurb: "A full customer-lifecycle program — stage messaging, channels, timing and KPIs.",
    format: "markdown", downloadExt: "md", cta: "Design lifecycle plan",
    fields: [
      { name: "product", label: "Product / segment", type: "text", placeholder: "e.g. first-time subscribers", required: true },
      { name: "context", label: "Business context & goal", type: "textarea", placeholder: "Current state, retention/AOV goals…", required: true },
      { name: "focus", label: "Primary focus", type: "select", options: ["Onboarding", "Retention", "Win-back", "AOV / cross-sell", "Full lifecycle"] },
      { name: "channels", label: "Channels available", type: "text", placeholder: "e.g. email, WhatsApp, SMS, push" },
    ],
  },
  {
    id: "meeting", label: "Meeting Studio", mode: "enterprise", icon: "ClipboardList", accent: E,
    blurb: "Turn raw notes or a transcript into clean minutes: decisions, action items (owners + dates), follow-ups.",
    format: "markdown", downloadExt: "md", cta: "Summarize meeting",
    fields: [
      { name: "notes", label: "Notes / transcript", type: "textarea", placeholder: "Paste raw meeting notes or transcript…", required: true },
      { name: "meeting", label: "Meeting & attendees", type: "text", placeholder: "e.g. Weekly growth sync — A, R, S" },
      { name: "output", label: "Output", type: "select", options: ["Minutes + action items", "Action items only", "Executive summary"] },
    ],
  },
  {
    id: "report", label: "Report & Memo Studio", mode: "enterprise", icon: "FileBarChart", accent: E,
    blurb: "A structured business report, memo, or one-pager from your inputs and data points.",
    format: "markdown", downloadExt: "md", cta: "Draft report",
    fields: [
      { name: "topic", label: "Report topic", type: "text", placeholder: "e.g. Q3 UK growth review", required: true },
      { name: "inputs", label: "Key points / data", type: "textarea", placeholder: "Metrics, findings, context — bullet points are fine", required: true },
      { name: "type", label: "Format", type: "select", options: ["Business report", "One-page memo", "Executive brief", "Weekly update"] },
      { name: "audience", label: "Audience", type: "text", placeholder: "e.g. leadership, board, team" },
    ],
  },
  {
    id: "sop", label: "SOP & Process Studio", mode: "enterprise", icon: "ListChecks", accent: E,
    blurb: "A clear standard-operating-procedure or process doc with steps, owners, and checks.",
    format: "markdown", downloadExt: "md", cta: "Write SOP",
    fields: [
      { name: "process", label: "Process / task", type: "text", placeholder: "e.g. New campaign QA before send", required: true },
      { name: "details", label: "How it works today", type: "textarea", placeholder: "Steps, tools, who's involved, gotchas…", required: true },
      { name: "audience", label: "For whom", type: "text", placeholder: "e.g. marketing ops team" },
    ],
  },
  {
    id: "jd", label: "Job Description", mode: "enterprise", icon: "Briefcase", accent: E,
    blurb: "A polished, inclusive job description with responsibilities, requirements, and about-the-role.",
    format: "markdown", downloadExt: "md", cta: "Write JD",
    fields: [
      { name: "role", label: "Role title", type: "text", placeholder: "e.g. Senior Growth Marketer", required: true },
      { name: "company", label: "Team / company context", type: "textarea", placeholder: "What the team does, mission, stage…", required: true },
      { name: "must", label: "Key responsibilities & must-haves", type: "textarea", placeholder: "Core outcomes, skills, experience…" },
      { name: "location", label: "Location & type", type: "text", placeholder: "e.g. Remote (India), full-time" },
    ],
  },
  {
    id: "prd", label: "PRD & Spec", mode: "enterprise", icon: "ScrollText", accent: E,
    blurb: "A crisp product requirements doc: problem, goals, scope, user stories, and success metrics.",
    format: "markdown", downloadExt: "md", cta: "Draft PRD",
    fields: [
      { name: "feature", label: "Feature / product", type: "text", placeholder: "e.g. In-app referral program", required: true },
      { name: "problem", label: "Problem & context", type: "textarea", placeholder: "Who it's for, why now, current state…", required: true },
      { name: "scope", label: "Goals / scope hints", type: "textarea", placeholder: "Must-haves, non-goals, constraints…" },
      { name: "detail", label: "Detail level", type: "select", options: ["Lightweight one-pager", "Standard PRD", "Detailed spec"] },
    ],
  },
  {
    id: "okr", label: "OKR Planner", mode: "enterprise", icon: "Target", accent: E,
    blurb: "Objectives and measurable key results for a team or quarter, with supporting initiatives.",
    format: "markdown", downloadExt: "md", cta: "Set OKRs",
    fields: [
      { name: "team", label: "Team / scope", type: "text", placeholder: "e.g. Growth team, Q3", required: true },
      { name: "priorities", label: "Priorities & context", type: "textarea", placeholder: "What matters most, current baseline…", required: true },
      { name: "count", label: "How many objectives", type: "select", options: ["1 focused", "2-3", "3-5"] },
      { name: "horizon", label: "Time horizon", type: "text", placeholder: "e.g. one quarter" },
    ],
  },
  {
    id: "proposal", label: "Proposal & SOW", mode: "enterprise", icon: "FileSignature", accent: E,
    blurb: "A client proposal or statement of work: scope, deliverables, timeline, and pricing structure.",
    format: "markdown", downloadExt: "md", cta: "Draft proposal",
    fields: [
      { name: "client", label: "Client / project", type: "text", placeholder: "e.g. Acme — website revamp", required: true },
      { name: "scope", label: "Scope & deliverables", type: "textarea", placeholder: "What you'll do, outcomes…", required: true },
      { name: "timeline", label: "Timeline & pricing hints", type: "text", placeholder: "e.g. 6 weeks, retainer vs fixed" },
      { name: "type", label: "Document", type: "select", options: ["Proposal", "Statement of Work", "Both"] },
    ],
  },
];

export function getTool(id: string): StudioTool | undefined {
  return STUDIO_TOOLS.find((t) => t.id === id);
}

// Category grouping within each mode's studio, so the hub reads as
// mode → category → tools (Personal: music/social/video/writing/life;
// Professional: ads & campaigns / website & email / content / sales;
// Enterprise: programs / docs / ops / people & deals).
export const TOOL_CATEGORY: Record<string, string> = {
  // Hobby (personal)
  music: "Music & Audio",
  "social-media": "Social & Video", video: "Social & Video",
  creative: "Writing",
  travel: "Life & Plans", recipe: "Life & Plans", workout: "Life & Plans",
  study: "Life & Plans", journal: "Life & Plans", budget: "Life & Plans",
  // Startup (professional)
  adcopy: "Ads & Campaigns", campaign: "Ads & Campaigns",
  landing: "Website & Email", mailer: "Website & Email",
  blog: "Content", social: "Content",
  pitch: "Sales & Fundraising",
  // Office (enterprise)
  lifecycle: "Programs",
  report: "Docs & Specs", prd: "Docs & Specs", sop: "Docs & Specs",
  meeting: "Ops", okr: "Ops",
  jd: "People & Deals", proposal: "People & Deals",
};

export const CATEGORY_ORDER: Record<ModeId, string[]> = {
  personal: ["Music & Audio", "Social & Video", "Writing", "Life & Plans"],
  professional: ["Ads & Campaigns", "Website & Email", "Content", "Sales & Fundraising"],
  enterprise: ["Programs", "Docs & Specs", "Ops", "People & Deals"],
};

export function categoryOf(id: string): string {
  return TOOL_CATEGORY[id] || "More";
}
