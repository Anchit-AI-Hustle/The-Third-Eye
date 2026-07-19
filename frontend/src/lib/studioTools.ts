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
];

export function getTool(id: string): StudioTool | undefined {
  return STUDIO_TOOLS.find((t) => t.id === id);
}
