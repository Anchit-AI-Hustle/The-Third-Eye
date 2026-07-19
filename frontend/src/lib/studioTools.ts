// Registry for the Studio — the Mirror per-mode "startup tools", natively built
// into The Third Eye and wired to the mode-aware runtime. Metadata here is
// shared by the client (renders the form + preview) and the server route
// (validates the tool + builds the system prompt). Kept framework-free so it
// imports cleanly on both sides.

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
  icon: string;          // lucide icon name, mapped in the client
  accent: string;
  blurb: string;
  format: OutputFormat;
  downloadExt: string;
  cta: string;           // button label
  fields: ToolField[];
}

export const STUDIO_TOOLS: StudioTool[] = [
  {
    id: "landing",
    label: "Landing Page Engine",
    mode: "professional",
    icon: "LayoutTemplate",
    accent: "#4FC3F7",
    blurb: "Generate a complete, responsive HTML landing page from a product brief — ready to preview, copy, or ship.",
    format: "html",
    downloadExt: "html",
    cta: "Generate landing page",
    fields: [
      { name: "product", label: "Product / brand", type: "text", placeholder: "e.g. Vahdam Turmeric Latte", required: true },
      { name: "brief", label: "What it is & why it's great", type: "textarea", placeholder: "One-paragraph pitch: the offer, key benefits, proof points…", required: true },
      { name: "audience", label: "Target audience", type: "text", placeholder: "e.g. wellness-focused urban millennials" },
      { name: "cta", label: "Primary call-to-action", type: "text", placeholder: "e.g. Shop now – 20% off first order" },
      { name: "tone", label: "Tone", type: "select", options: ["Premium & minimal", "Warm & wellness", "Bold & punchy", "Editorial & storytelling"] },
    ],
  },
  {
    id: "mailer",
    label: "HTML Mailer Architect",
    mode: "professional",
    icon: "Mail",
    accent: "#4FC3F7",
    blurb: "Produce an email-client-safe, table-based HTML mailer for a campaign — inline styles, mobile-friendly, copy-paste into your ESP.",
    format: "html",
    downloadExt: "html",
    cta: "Generate mailer",
    fields: [
      { name: "campaign", label: "Campaign goal", type: "text", placeholder: "e.g. Diwali gifting launch", required: true },
      { name: "message", label: "Key message & offer", type: "textarea", placeholder: "What are we saying? Offer, hero product, urgency…", required: true },
      { name: "subject", label: "Subject line direction", type: "text", placeholder: "e.g. playful, curiosity-driven" },
      { name: "cta", label: "Call-to-action", type: "text", placeholder: "e.g. Shop the gift edit" },
      { name: "tone", label: "Tone", type: "select", options: ["Premium & minimal", "Warm & wellness", "Festive & urgent", "Editorial & storytelling"] },
    ],
  },
  {
    id: "lifecycle",
    label: "Lifecycle OS",
    mode: "enterprise",
    icon: "Workflow",
    accent: "#A78BFA",
    blurb: "Design a full customer-lifecycle program — stage-by-stage messaging, channels, timing and KPIs — as an actionable plan.",
    format: "markdown",
    downloadExt: "md",
    cta: "Design lifecycle plan",
    fields: [
      { name: "product", label: "Product / segment", type: "text", placeholder: "e.g. first-time tea subscribers", required: true },
      { name: "context", label: "Business context & goal", type: "textarea", placeholder: "Current state, retention/AOV goals, constraints…", required: true },
      { name: "focus", label: "Primary focus", type: "select", options: ["Onboarding", "Retention", "Win-back", "AOV / cross-sell", "Full lifecycle"] },
      { name: "channels", label: "Channels available", type: "text", placeholder: "e.g. email, WhatsApp, SMS, push" },
    ],
  },
  {
    id: "creative",
    label: "Creative Studio",
    mode: "personal",
    icon: "Music",
    accent: "#34D399",
    blurb: "A personal creative generator — song lyrics, a ready-to-paste music-gen prompt (Suno/Udio), poems or captions from a simple brief.",
    format: "markdown",
    downloadExt: "md",
    cta: "Create",
    fields: [
      { name: "brief", label: "Your idea", type: "textarea", placeholder: "What's it about? Theme, mood, story, occasion…", required: true },
      { name: "format", label: "What to create", type: "select", options: ["Song lyrics", "Music-gen prompt (Suno/Udio)", "Poem", "Social caption set"] },
      { name: "vibe", label: "Genre / vibe", type: "text", placeholder: "e.g. lo-fi acoustic, upbeat pop, cinematic" },
    ],
  },
];

export function getTool(id: string): StudioTool | undefined {
  return STUDIO_TOOLS.find((t) => t.id === id);
}
