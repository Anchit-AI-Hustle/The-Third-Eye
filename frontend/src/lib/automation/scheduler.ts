import { pickIdea, generatePost } from "./content";
import { ADAPTERS, configuredAdapters } from "./channels";
import type { PostDraft, PostResult } from "./types";

function dayOfYear(d: Date): number {
  const start = Date.UTC(d.getUTCFullYear(), 0, 0);
  return Math.floor((d.getTime() - start) / 86_400_000);
}

export interface RunResult {
  ranAt: string;
  dryRun: boolean;
  draft: PostDraft;
  posted: PostResult[];
  channels: Array<{ id: string; name: string; configured: boolean }>;
  llm: boolean;
}

/**
 * Generate today's post and publish it to every connected channel.
 * `dryRun` generates the content but posts nothing (used by /preview).
 * `seed` overrides the day-of-year rotation (used to preview a specific post).
 */
export async function runScheduledPost(opts?: { dryRun?: boolean; seed?: number }): Promise<RunResult> {
  const now = new Date();
  const seed = opts?.seed ?? dayOfYear(now);
  const dryRun = !!opts?.dryRun;

  const idea = pickIdea(seed);
  const draft = await generatePost(idea);

  const adapters = configuredAdapters();
  const posted: PostResult[] = dryRun
    ? adapters.map((a) => ({ channel: a.id, ok: true, skipped: true }))
    : await Promise.all(adapters.map((a) => a.post(draft)));

  return {
    ranAt: now.toISOString(),
    dryRun,
    draft,
    posted,
    channels: ADAPTERS.map((a) => ({ id: a.id, name: a.name, configured: a.isConfigured() })),
    llm: !!process.env.ANTHROPIC_API_KEY,
  };
}
