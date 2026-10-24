import { AsyncLocalStorage } from "node:async_hooks";
import { getDb } from "@/lib/db";
import { decrypt, encrypt } from "@/lib/crypto";

// A user's own AI provider keys, used for their requests ahead of the
// deployment's shared ones, so one person's free-tier quota running out
// doesn't stop them. "ollama" holds a URL (their own machine, usually through
// a tunnel) instead of a key.

export const OWN_KEY_PROVIDERS = ["gemini", "groq", "openrouter", "mistral", "cerebras", "openai", "ollama"] as const;
export type OwnKeyProvider = (typeof OWN_KEY_PROVIDERS)[number];
// How that Ollama is used, stored alongside it: its tunnel password, the model
// to run (one for everyone, or one per assistant as JSON), and "off" in
// local_first when the user wants the cloud tried before their own machine.
export const LOCAL_SETTINGS = ["ollama_token", "ollama_model", "ollama_models", "local_first"] as const;
export type LocalSetting = (typeof LOCAL_SETTINGS)[number];
export type OwnKeys = Partial<Record<OwnKeyProvider | LocalSetting, string>> & { userId: string };

const store = new AsyncLocalStorage<OwnKeys>();
const persona = new AsyncLocalStorage<string>();
const CACHE_MS = 60_000;
const cache = new Map<string, { at: number; keys: OwnKeys }>();

export async function loadOwnKeys(userId: string): Promise<OwnKeys> {
  const hit = cache.get(userId);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.keys;
  const keys: OwnKeys = { userId };
  const db = getDb();
  if (db) {
    const { data } = await db.from("user_provider_keys").select("provider, key_enc").eq("user_id", userId);
    for (const row of (data ?? []) as { provider: OwnKeyProvider | LocalSetting; key_enc: string }[]) {
      const plain = decrypt(row.key_enc);
      if (plain) keys[row.provider] = plain;
    }
  }
  cache.set(userId, { at: Date.now(), keys });
  return keys;
}

export function withKeys<T>(keys: OwnKeys, fn: () => Promise<T>): Promise<T> {
  return store.run(keys, fn);
}

/** Runs fn with this user's own keys visible to every provider call inside it. */
export async function withOwnKeys<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  return withKeys(await loadOwnKeys(userId), fn);
}

export function currentOwnKeys(): OwnKeys | undefined {
  return store.getStore();
}

/** Marks the rest of this request as answered by one assistant (jarvis, friday…), for its own local model. */
export function enterPersona(id: unknown): void {
  if (typeof id === "string" && /^[\w-]{1,40}$/.test(id)) persona.enterWith(id);
}

export function currentPersona(): string | undefined {
  return persona.getStore();
}

/** The user's own Ollama answers first unless they turned that off. */
export function localFirst(keys = currentOwnKeys()): boolean {
  return !!keys?.ollama && keys.local_first !== "off";
}

/** The model this user's Ollama runs for the current assistant, if they chose one. */
export function ownOllamaModel(keys = currentOwnKeys(), assistant = currentPersona()): string | undefined {
  if (!keys?.ollama) return undefined;
  if (assistant && keys.ollama_models) {
    try {
      const m = (JSON.parse(keys.ollama_models) as Record<string, unknown>)[assistant];
      if (typeof m === "string" && m) return m;
    } catch { /* unreadable map: fall back to the one model */ }
  }
  return keys.ollama_model || undefined;
}

/** The Authorization header for the user's tunnel: user:password is Basic auth, anything else a bearer token. */
export function tunnelAuth(token: string): string {
  return token.includes(":") ? `Basic ${Buffer.from(token).toString("base64")}` : `Bearer ${token}`;
}

export const isModelName = (m: string) => /^[\w.:/-]{1,100}$/.test(m);

// The server fetches this URL, so it must not reach the deployment's own
// network: public https hosts only.
export function ollamaUrlProblem(raw: string): string | null {
  let u: URL;
  try { u = new URL(raw); } catch { return "That isn't a URL."; }
  if (u.protocol !== "https:") return "Use an https URL (a tunnel such as Cloudflare Tunnel or ngrok gives you one).";
  const h = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const ip4 = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/)?.slice(1).map(Number);
  const privateIp = ip4
    ? ip4[0] === 10 || ip4[0] === 127 || ip4[0] === 0 || (ip4[0] === 169 && ip4[1] === 254)
      || (ip4[0] === 172 && ip4[1] >= 16 && ip4[1] <= 31) || (ip4[0] === 192 && ip4[1] === 168)
      || (ip4[0] === 100 && ip4[1] >= 64 && ip4[1] <= 127)
    : h.includes(":");
  if (privateIp || h === "localhost" || /\.(localhost|local|internal|lan|home)$/.test(h) || !h.includes(".")) {
    return "That address is on a private network. Expose Ollama through a public https tunnel instead.";
  }
  return null;
}

export async function saveOwnKey(userId: string, provider: OwnKeyProvider | LocalSetting, value: string): Promise<boolean> {
  const db = getDb();
  const enc = encrypt(value);
  if (!db || !enc) return false;
  const { error } = await db.from("user_provider_keys").upsert({ user_id: userId, provider, key_enc: enc, updated_at: new Date().toISOString() }, { onConflict: "user_id,provider" });
  cache.delete(userId);
  return !error;
}

export async function deleteOwnKey(userId: string, provider: OwnKeyProvider | LocalSetting): Promise<void> {
  await getDb()?.from("user_provider_keys").delete().eq("user_id", userId).eq("provider", provider);
  cache.delete(userId);
}
