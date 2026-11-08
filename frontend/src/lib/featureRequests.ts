import { getGithubAccessToken } from "@/lib/github";
import { sendPush } from "@/lib/push";
import { sendWhatsAppTemplate } from "@/lib/whatsapp";

// When the assistant can't do what was asked because the app lacks the
// feature, it writes the feature up and files it for the owner to review. Code
// is never added on its own: the owner approves the issue (label "approved"),
// a scheduled Claude Code session builds it into a pull request, the daily
// cron sends that pull request to the owner, and the owner merges it or not.

export const FEATURE_REPO = "Anchit-AI-Hustle/The-Third-Eye";

const owners = () => (process.env.OWNER_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
const reviewNumber = () => (process.env.FEATURE_REVIEW_WHATSAPP ?? "").replace(/[^\d]/g, "");

export interface FeatureRequest { title: string; goal: string; spec: string; askedBy: string; userWords?: string }

export async function notifyOwner(text: string, url: string): Promise<string[]> {
  const sent: string[] = [];
  const number = reviewNumber();
  if (number && (await sendWhatsAppTemplate(number, `${text} ${url}`).catch(() => false))) sent.push("WhatsApp");
  for (const owner of owners()) if (await sendPush(owner, "Feature to review", text, url).catch(() => false)) { sent.push("notification"); break; }
  return sent;
}

export async function fileFeatureRequest(r: FeatureRequest): Promise<{ ok: boolean; result: string; url?: string }> {
  const owner = owners()[0];
  const gh = owner ? await getGithubAccessToken(owner).catch(() => null) : null;
  if (!gh?.token) return { ok: false, result: "The feature couldn't be filed for review: the owner's GitHub isn't connected to The Third Eye. Nothing was built." };

  const body = [
    `**Goal:** ${r.goal}`,
    r.userWords ? `**What the person said:** ${r.userWords}` : "",
    `**Spec:**\n${r.spec}`,
    `**Requested by:** ${r.askedBy === owner ? "you" : "a user"}`,
    "---",
    "Written by JARVIS. To build it, add the `approved` label: a pull request is opened for your review within a few hours, and nothing reaches the app until you merge it.",
  ].filter(Boolean).join("\n\n");
  const res = await fetch(`https://api.github.com/repos/${FEATURE_REPO}/issues`, {
    method: "POST",
    signal: AbortSignal.timeout(20_000),
    headers: { Authorization: `Bearer ${gh.token}`, Accept: "application/vnd.github+json", "Content-Type": "application/json", "User-Agent": "the-third-eye" },
    body: JSON.stringify({ title: `Feature: ${r.title.slice(0, 120)}`, body, labels: ["jarvis-feature"] }),
  });
  const issue = (await res.json().catch(() => ({}))) as { html_url?: string };
  if (!res.ok || !issue.html_url) return { ok: false, result: `The feature couldn't be filed for review (GitHub said ${res.status}). Nothing was built.` };

  const sent = await notifyOwner(`JARVIS wrote up a feature for your review: "${r.title}".`, issue.html_url);
  return {
    ok: true,
    url: issue.html_url,
    result: `Written up "${r.title}" and sent it for review${sent.length ? ` (${sent.join(" and ")})` : " (on GitHub; no WhatsApp or notification could be sent)"}. It isn't in the app yet: once it's approved and built, it goes in after review.`,
  };
}

// Pull requests built for approved features ("Closes #N" on a jarvis-feature
// issue) opened in the last day, sent to the owner. Run by the daily cron.
export async function notifyNewFeaturePRs(): Promise<number> {
  const owner = owners()[0];
  const gh = owner ? await getGithubAccessToken(owner).catch(() => null) : null;
  if (!gh?.token) return 0;
  const since = new Date(Date.now() - 24 * 60 * 60_000).toISOString().slice(0, 19);
  const q = encodeURIComponent(`repo:${FEATURE_REPO} is:pr is:open head:jarvis-feature- created:>=${since}`);
  const res = await fetch(`https://api.github.com/search/issues?q=${q}`, {
    signal: AbortSignal.timeout(20_000),
    headers: { Authorization: `Bearer ${gh.token}`, Accept: "application/vnd.github+json", "User-Agent": "the-third-eye" },
  });
  const items = ((await res.json().catch(() => ({}))) as { items?: { title: string; html_url: string }[] }).items ?? [];
  for (const pr of items) await notifyOwner(`Built and ready for your review: "${pr.title.slice(0, 120)}".`, pr.html_url);
  return items.length;
}
