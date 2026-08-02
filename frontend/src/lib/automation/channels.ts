import { AUTOMATION } from "./config";
import type { ChannelAdapter, PostDraft } from "./types";

function composed(draft: PostDraft): string {
  return AUTOMATION.compose(draft.text, draft.link, draft.hashtags);
}

// ─── X / Twitter ──────────────────────────────────────────────────────────
// Requires an OAuth2 user-context access token with tweet.write scope in
// X_ACCESS_TOKEN. (App-only bearer tokens cannot post.)
const xAdapter: ChannelAdapter = {
  id: "x",
  name: "X (Twitter)",
  isConfigured: () => !!process.env.X_ACCESS_TOKEN,
  async post(draft) {
    const token = process.env.X_ACCESS_TOKEN;
    if (!token) return { channel: "x", ok: false, skipped: true, error: "X_ACCESS_TOKEN not set" };
    try {
      const res = await fetch("https://api.twitter.com/2/tweets", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ text: composed(draft).slice(0, 280) }),
      });
      const data: unknown = await res.json().catch(() => ({}));
      if (!res.ok) return { channel: "x", ok: false, error: `HTTP ${res.status}: ${JSON.stringify(data)}` };
      const id = (data as { data?: { id?: string } })?.data?.id;
      return { channel: "x", ok: true, id };
    } catch (e) {
      return { channel: "x", ok: false, error: e instanceof Error ? e.message : "request failed" };
    }
  },
};

// ─── LinkedIn ─────────────────────────────────────────────────────────────
// Requires LINKEDIN_ACCESS_TOKEN (w_member_social scope) and LINKEDIN_AUTHOR_URN
// (e.g. "urn:li:person:XXXX" or "urn:li:organization:XXXX").
const linkedinAdapter: ChannelAdapter = {
  id: "linkedin",
  name: "LinkedIn",
  isConfigured: () => !!(process.env.LINKEDIN_ACCESS_TOKEN && process.env.LINKEDIN_AUTHOR_URN),
  async post(draft) {
    const token = process.env.LINKEDIN_ACCESS_TOKEN;
    const author = process.env.LINKEDIN_AUTHOR_URN;
    if (!token || !author) return { channel: "linkedin", ok: false, skipped: true, error: "LinkedIn env not set" };
    try {
      const res = await fetch("https://api.linkedin.com/v2/ugcPosts", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "X-Restli-Protocol-Version": "2.0.0",
        },
        body: JSON.stringify({
          author,
          lifecycleState: "PUBLISHED",
          specificContent: {
            "com.linkedin.ugc.ShareContent": {
              shareCommentary: { text: composed(draft) },
              shareMediaCategory: "NONE",
            },
          },
          visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" },
        }),
      });
      const data: unknown = await res.json().catch(() => ({}));
      if (!res.ok) return { channel: "linkedin", ok: false, error: `HTTP ${res.status}: ${JSON.stringify(data)}` };
      const id = (data as { id?: string })?.id;
      return { channel: "linkedin", ok: true, id };
    } catch (e) {
      return { channel: "linkedin", ok: false, error: e instanceof Error ? e.message : "request failed" };
    }
  },
};

// ─── Universal webhook (covers "all channels") ──────────────────────────────
// POSTs the draft to AUTOMATION_WEBHOOK_URL — a Zapier / Make / n8n / IFTTT hook
// you own — which then fans out to any platform using your existing connections.
// This is the reliable path to Instagram, Facebook, Threads, Reddit, Telegram,
// YouTube community, etc. without per-platform OAuth here.
const webhookAdapter: ChannelAdapter = {
  id: "webhook",
  name: "Universal webhook (Zapier / Make / n8n)",
  isConfigured: () => !!process.env.AUTOMATION_WEBHOOK_URL,
  async post(draft) {
    const url = process.env.AUTOMATION_WEBHOOK_URL;
    if (!url) return { channel: "webhook", ok: false, skipped: true, error: "AUTOMATION_WEBHOOK_URL not set" };
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: draft.text,
          link: draft.link,
          hashtags: draft.hashtags,
          composed: composed(draft),
          calculatorSlug: draft.calculatorSlug,
        }),
      });
      if (!res.ok) return { channel: "webhook", ok: false, error: `HTTP ${res.status}` };
      return { channel: "webhook", ok: true };
    } catch (e) {
      return { channel: "webhook", ok: false, error: e instanceof Error ? e.message : "request failed" };
    }
  },
};

export const ADAPTERS: ChannelAdapter[] = [xAdapter, linkedinAdapter, webhookAdapter];

export function configuredAdapters(): ChannelAdapter[] {
  return ADAPTERS.filter((a) => a.isConfigured());
}
