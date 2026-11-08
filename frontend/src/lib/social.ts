import { createHash, randomBytes } from "crypto";
import { getDb } from "@/lib/db";
import { decrypt, encrypt } from "@/lib/crypto";

// Each person connects their own social accounts (OAuth) and the assistant
// posts as them, only when they ask. A platform appears once its developer app
// keys are set on the server; until then it is listed as not set up, honestly.

export type Platform = "facebook" | "instagram" | "threads" | "x" | "linkedin" | "reddit";

export interface SocialAccount {
  platform: Platform;
  accountId: string;
  name: string;
  token: string;
  refresh?: string | null;
  expiresAt?: number | null;
}

interface Provider {
  name: string;
  env: [string, string];
  authorize: string;
  scope: string;
  pkce?: boolean;
  extra?: Record<string, string>;
  /** Code -> the accounts this login gives access to. */
  accounts: (code: string, redirect: string, verifier: string | undefined, cfg: { id: string; secret: string }) => Promise<Omit<SocialAccount, "platform">[] | { platform: Platform; list: Omit<SocialAccount, "platform">[] }[]>;
  post: (a: SocialAccount, p: { text: string; imageUrl?: string; title?: string }) => Promise<{ id?: string; url?: string }>;
  refresh?: (a: SocialAccount, cfg: { id: string; secret: string }) => Promise<{ token: string; refresh?: string; expiresAt?: number }>;
}

const GRAPH = "https://graph.facebook.com/v21.0";

async function call(url: string, init?: RequestInit): Promise<any> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(20_000) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.error) {
    const msg = data?.error?.message ?? data?.error_description ?? data?.detail ?? data?.message ?? (typeof data?.error === "string" ? data.error : `HTTP ${res.status}`);
    throw new Error(String(msg).slice(0, 300));
  }
  return data;
}

const form = (o: Record<string, string>) => new URLSearchParams(o);
const basic = (id: string, secret: string) => `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`;
const expiry = (seconds?: number) => (seconds ? Date.now() + seconds * 1000 : null);

// One Meta login gives the person's Facebook Pages and the Instagram business
// accounts linked to them; Meta's API posts to Pages, not personal profiles.
async function metaAccounts(code: string, redirect: string, _v: string | undefined, cfg: { id: string; secret: string }) {
  const short = await call(`${GRAPH}/oauth/access_token?${form({ client_id: cfg.id, client_secret: cfg.secret, redirect_uri: redirect, code })}`);
  const long = await call(`${GRAPH}/oauth/access_token?${form({ grant_type: "fb_exchange_token", client_id: cfg.id, client_secret: cfg.secret, fb_exchange_token: short.access_token })}`);
  const pages = await call(`${GRAPH}/me/accounts?${form({ fields: "id,name,access_token,instagram_business_account{id,username}", access_token: long.access_token })}`);
  const fb: Omit<SocialAccount, "platform">[] = [];
  const ig: Omit<SocialAccount, "platform">[] = [];
  for (const p of pages.data ?? []) {
    fb.push({ accountId: p.id, name: p.name, token: p.access_token });
    if (p.instagram_business_account?.id) ig.push({ accountId: p.instagram_business_account.id, name: `@${p.instagram_business_account.username ?? p.name}`, token: p.access_token });
  }
  return [{ platform: "facebook" as const, list: fb }, { platform: "instagram" as const, list: ig }];
}

export const PROVIDERS: Record<Platform, Provider> = {
  facebook: {
    name: "Facebook Pages",
    env: ["META_APP_ID", "META_APP_SECRET"],
    authorize: "https://www.facebook.com/v21.0/dialog/oauth",
    scope: "pages_show_list,pages_manage_posts,pages_read_engagement,instagram_basic,instagram_content_publish,business_management",
    accounts: metaAccounts,
    async post(a, p) {
      const out = p.imageUrl
        ? await call(`${GRAPH}/${a.accountId}/photos`, { method: "POST", body: form({ url: p.imageUrl, caption: p.text, access_token: a.token }) })
        : await call(`${GRAPH}/${a.accountId}/feed`, { method: "POST", body: form({ message: p.text, access_token: a.token }) });
      const id = out.post_id ?? out.id;
      return { id, url: id ? `https://www.facebook.com/${id}` : undefined };
    },
  },
  instagram: {
    name: "Instagram (business or creator, via a Facebook Page)",
    env: ["META_APP_ID", "META_APP_SECRET"],
    authorize: "https://www.facebook.com/v21.0/dialog/oauth",
    scope: "pages_show_list,pages_manage_posts,pages_read_engagement,instagram_basic,instagram_content_publish,business_management",
    accounts: metaAccounts,
    async post(a, p) {
      if (!p.imageUrl) throw new Error("Instagram posts need an image; give me one (a link or a generated image) and I'll post it with this caption.");
      const media = await call(`${GRAPH}/${a.accountId}/media`, { method: "POST", body: form({ image_url: p.imageUrl, caption: p.text, access_token: a.token }) });
      const out = await call(`${GRAPH}/${a.accountId}/media_publish`, { method: "POST", body: form({ creation_id: media.id, access_token: a.token }) });
      const link = await call(`${GRAPH}/${out.id}?${form({ fields: "permalink", access_token: a.token })}`).catch(() => ({}));
      return { id: out.id, url: link.permalink };
    },
  },
  threads: {
    name: "Threads",
    env: ["THREADS_APP_ID", "THREADS_APP_SECRET"],
    authorize: "https://threads.net/oauth/authorize",
    scope: "threads_basic,threads_content_publish",
    async accounts(code, redirect, _v, cfg) {
      const short = await call("https://graph.threads.net/oauth/access_token", { method: "POST", body: form({ client_id: cfg.id, client_secret: cfg.secret, grant_type: "authorization_code", redirect_uri: redirect, code }) });
      const long = await call(`https://graph.threads.net/access_token?${form({ grant_type: "th_exchange_token", client_secret: cfg.secret, access_token: short.access_token })}`);
      const me = await call(`https://graph.threads.net/v1.0/me?${form({ fields: "id,username", access_token: long.access_token })}`);
      return [{ accountId: me.id, name: `@${me.username}`, token: long.access_token, expiresAt: expiry(long.expires_in) }];
    },
    async post(a, p) {
      const params: Record<string, string> = p.imageUrl ? { media_type: "IMAGE", image_url: p.imageUrl, text: p.text } : { media_type: "TEXT", text: p.text };
      const c = await call(`https://graph.threads.net/v1.0/${a.accountId}/threads`, { method: "POST", body: form({ ...params, access_token: a.token }) });
      const out = await call(`https://graph.threads.net/v1.0/${a.accountId}/threads_publish`, { method: "POST", body: form({ creation_id: c.id, access_token: a.token }) });
      return { id: out.id };
    },
  },
  x: {
    name: "X (Twitter)",
    env: ["X_CLIENT_ID", "X_CLIENT_SECRET"],
    authorize: "https://twitter.com/i/oauth2/authorize",
    scope: "tweet.read tweet.write users.read offline.access",
    pkce: true,
    async accounts(code, redirect, verifier, cfg) {
      const t = await call("https://api.twitter.com/2/oauth2/token", { method: "POST", headers: { Authorization: basic(cfg.id, cfg.secret) }, body: form({ grant_type: "authorization_code", code, redirect_uri: redirect, code_verifier: verifier ?? "" }) });
      const me = await call("https://api.twitter.com/2/users/me", { headers: { Authorization: `Bearer ${t.access_token}` } });
      return [{ accountId: me.data.id, name: `@${me.data.username}`, token: t.access_token, refresh: t.refresh_token, expiresAt: expiry(t.expires_in) }];
    },
    async refresh(a, cfg) {
      const t = await call("https://api.twitter.com/2/oauth2/token", { method: "POST", headers: { Authorization: basic(cfg.id, cfg.secret) }, body: form({ grant_type: "refresh_token", refresh_token: a.refresh ?? "" }) });
      return { token: t.access_token, refresh: t.refresh_token, expiresAt: expiry(t.expires_in) ?? undefined };
    },
    async post(a, p) {
      const out = await call("https://api.twitter.com/2/tweets", { method: "POST", headers: { Authorization: `Bearer ${a.token}`, "Content-Type": "application/json" }, body: JSON.stringify({ text: p.text.slice(0, 280) }) });
      return { id: out.data?.id, url: out.data?.id ? `https://x.com/i/status/${out.data.id}` : undefined };
    },
  },
  linkedin: {
    name: "LinkedIn",
    env: ["LINKEDIN_CLIENT_ID", "LINKEDIN_CLIENT_SECRET"],
    authorize: "https://www.linkedin.com/oauth/v2/authorization",
    scope: "openid profile w_member_social",
    async accounts(code, redirect, _v, cfg) {
      const t = await call("https://www.linkedin.com/oauth/v2/accessToken", { method: "POST", body: form({ grant_type: "authorization_code", code, redirect_uri: redirect, client_id: cfg.id, client_secret: cfg.secret }) });
      const me = await call("https://api.linkedin.com/v2/userinfo", { headers: { Authorization: `Bearer ${t.access_token}` } });
      return [{ accountId: `urn:li:person:${me.sub}`, name: me.name ?? "LinkedIn", token: t.access_token, refresh: t.refresh_token ?? null, expiresAt: expiry(t.expires_in) }];
    },
    async post(a, p) {
      const res = await fetch("https://api.linkedin.com/v2/ugcPosts", {
        method: "POST",
        signal: AbortSignal.timeout(20_000),
        headers: { Authorization: `Bearer ${a.token}`, "Content-Type": "application/json", "X-Restli-Protocol-Version": "2.0.0" },
        body: JSON.stringify({
          author: a.accountId,
          lifecycleState: "PUBLISHED",
          specificContent: { "com.linkedin.ugc.ShareContent": { shareCommentary: { text: p.text }, shareMediaCategory: "NONE" } },
          visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" },
        }),
      });
      if (!res.ok) throw new Error(`LinkedIn refused the post (HTTP ${res.status}).`);
      const id = res.headers.get("x-restli-id") ?? undefined;
      return { id, url: id ? `https://www.linkedin.com/feed/update/${id}` : undefined };
    },
  },
  reddit: {
    name: "Reddit",
    env: ["REDDIT_CLIENT_ID", "REDDIT_CLIENT_SECRET"],
    authorize: "https://www.reddit.com/api/v1/authorize",
    scope: "identity submit",
    extra: { duration: "permanent" },
    async accounts(code, redirect, _v, cfg) {
      const t = await call("https://www.reddit.com/api/v1/access_token", { method: "POST", headers: { Authorization: basic(cfg.id, cfg.secret), "User-Agent": "the-third-eye/1.0" }, body: form({ grant_type: "authorization_code", code, redirect_uri: redirect }) });
      const me = await call("https://oauth.reddit.com/api/v1/me", { headers: { Authorization: `Bearer ${t.access_token}`, "User-Agent": "the-third-eye/1.0" } });
      return [{ accountId: me.name, name: `u/${me.name}`, token: t.access_token, refresh: t.refresh_token, expiresAt: expiry(t.expires_in) }];
    },
    async refresh(a, cfg) {
      const t = await call("https://www.reddit.com/api/v1/access_token", { method: "POST", headers: { Authorization: basic(cfg.id, cfg.secret), "User-Agent": "the-third-eye/1.0" }, body: form({ grant_type: "refresh_token", refresh_token: a.refresh ?? "" }) });
      return { token: t.access_token, refresh: a.refresh ?? undefined, expiresAt: expiry(t.expires_in) ?? undefined };
    },
    async post(a, p) {
      // Posts to the person's own profile; a subreddit has its own rules to read first.
      const out = await call("https://oauth.reddit.com/api/submit", {
        method: "POST",
        headers: { Authorization: `Bearer ${a.token}`, "User-Agent": "the-third-eye/1.0" },
        body: form({ sr: `u_${a.accountId}`, kind: p.imageUrl ? "link" : "self", title: (p.title ?? p.text.split("\n")[0]).slice(0, 300), ...(p.imageUrl ? { url: p.imageUrl } : { text: p.text }), api_type: "json" }),
      });
      const url = out?.json?.data?.url;
      if (out?.json?.errors?.length) throw new Error(String(out.json.errors[0]?.[1] ?? "Reddit refused the post."));
      return { id: out?.json?.data?.id, url };
    },
  },
};

export const PLATFORMS = Object.keys(PROVIDERS) as Platform[];

export function providerConfig(p: Platform): { id: string; secret: string } | null {
  const [i, s] = PROVIDERS[p].env;
  const id = process.env[i], secret = process.env[s];
  return id && secret ? { id, secret } : null;
}

// ---- OAuth start --------------------------------------------------------

export function authorizeUrl(p: Platform, redirect: string, state: string): { url: string; verifier?: string } {
  const prov = PROVIDERS[p];
  const cfg = providerConfig(p)!;
  const params: Record<string, string> = { client_id: cfg.id, redirect_uri: redirect, response_type: "code", scope: prov.scope, state, ...(prov.extra ?? {}) };
  let verifier: string | undefined;
  if (prov.pkce) {
    verifier = randomBytes(32).toString("base64url");
    params.code_challenge = createHash("sha256").update(verifier).digest("base64url");
    params.code_challenge_method = "S256";
  }
  return { url: `${prov.authorize}?${new URLSearchParams(params)}`, verifier };
}

// ---- Storage ------------------------------------------------------------

export async function saveAccounts(email: string, platform: Platform, list: Omit<SocialAccount, "platform">[]): Promise<number> {
  const sb = getDb();
  if (!sb) return 0;
  let saved = 0;
  for (const a of list) {
    const enc = encrypt(a.token);
    if (!enc) continue;
    const { error } = await sb.from("social_accounts").upsert({
      user_id: email, platform, account_id: a.accountId, name: a.name,
      access_token_enc: enc, refresh_token_enc: a.refresh ? encrypt(a.refresh) : null,
      expires_at: a.expiresAt ? new Date(a.expiresAt).toISOString() : null, updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,platform,account_id" });
    if (!error) saved++;
  }
  return saved;
}

export async function listAccounts(email: string): Promise<SocialAccount[]> {
  const sb = getDb();
  if (!sb) return [];
  const { data } = await sb.from("social_accounts").select("platform, account_id, name, access_token_enc, refresh_token_enc, expires_at").eq("user_id", email);
  return ((data ?? []) as any[]).flatMap((r) => {
    const token = decrypt(r.access_token_enc);
    if (!token) return [];
    return [{ platform: r.platform, accountId: r.account_id, name: r.name, token, refresh: r.refresh_token_enc ? decrypt(r.refresh_token_enc) : null, expiresAt: r.expires_at ? Date.parse(r.expires_at) : null }];
  });
}

export async function removeAccount(email: string, platform: Platform, accountId: string): Promise<boolean> {
  const sb = getDb();
  if (!sb) return false;
  const { error } = await sb.from("social_accounts").delete().eq("user_id", email).eq("platform", platform).eq("account_id", accountId);
  return !error;
}

// ---- Posting ------------------------------------------------------------

export interface PostResult { platform: Platform; account: string; ok: boolean; url?: string; error?: string }

export async function postEverywhere(email: string, platforms: Platform[], p: { text: string; imageUrl?: string; title?: string }): Promise<PostResult[]> {
  const accounts = (await listAccounts(email)).filter((a) => platforms.includes(a.platform));
  const out: PostResult[] = [];
  for (const platform of platforms) {
    const mine = accounts.filter((a) => a.platform === platform);
    if (!mine.length) { out.push({ platform, account: "", ok: false, error: `${PROVIDERS[platform].name} isn't connected. Connect it in Settings → Account → Social accounts.` }); continue; }
    for (let a of mine) {
      try {
        const prov = PROVIDERS[platform];
        const cfg = providerConfig(platform);
        if (prov.refresh && cfg && a.expiresAt && a.expiresAt < Date.now() + 60_000) {
          const t = await prov.refresh(a, cfg);
          a = { ...a, token: t.token, refresh: t.refresh ?? a.refresh, expiresAt: t.expiresAt ?? null };
          await saveAccounts(email, platform, [a]);
        }
        const r = await prov.post(a, p);
        out.push({ platform, account: a.name, ok: true, url: r.url });
      } catch (e) {
        out.push({ platform, account: a.name, ok: false, error: e instanceof Error ? e.message : "failed" });
      }
    }
  }
  return out;
}

export function describeResults(results: PostResult[]): string {
  return results.map((r) => r.ok
    ? `Posted on ${PROVIDERS[r.platform].name}${r.account ? ` as ${r.account}` : ""}${r.url ? `: ${r.url}` : "."}`
    : `Not posted on ${PROVIDERS[r.platform].name}${r.account ? ` (${r.account})` : ""}: ${r.error}`).join("\n");
}
