// Social automation — shared types.
//
// The engine generates finance content from the calculators (or evergreen
// tips), then posts it to every channel the owner has connected. "Connected"
// means the relevant env vars are set — credentials live in the owner's
// environment, never in code and never handled by anyone else.

export type ChannelId = "x" | "linkedin" | "webhook";

export interface ContentIdea {
  kind: "calculator-spotlight" | "money-tip";
  calculatorSlug?: string;
  /** Instruction handed to the content generator (Claude). */
  prompt: string;
  /** Deterministic text used when no LLM key is configured, or on API error. */
  fallback: string;
  link?: string;
}

export interface PostDraft {
  text: string;
  link?: string;
  hashtags?: string[];
  calculatorSlug?: string;
}

export interface PostResult {
  channel: ChannelId;
  ok: boolean;
  id?: string;
  error?: string;
  skipped?: boolean;
}

export interface ChannelAdapter {
  id: ChannelId;
  name: string;
  /** True when the required credentials are present in the environment. */
  isConfigured: () => boolean;
  post: (draft: PostDraft) => Promise<PostResult>;
}
