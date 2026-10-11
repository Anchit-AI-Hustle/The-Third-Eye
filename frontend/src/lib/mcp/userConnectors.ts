import { lookup } from "dns/promises";
import { isIP } from "net";
import { getDb } from "@/lib/db";
import { decrypt } from "@/lib/crypto";
import type { McpServer } from "./client";

// Connectors a user adds themselves. Unlike MCP_SERVERS (set by the deployer),
// these URLs come from users, so every request first proves the host is public:
// otherwise a connector could point the server at its own network.

const PRIVATE_V4 = [
  [0x00000000, 8], [0x0a000000, 8], [0x64400000, 10], [0x7f000000, 8], [0xa9fe0000, 16],
  [0xac100000, 12], [0xc0000000, 24], [0xc0a80000, 16], [0xc6120000, 15], [0xe0000000, 4], [0xf0000000, 4],
] as const;

function privateV4(ip: string): boolean {
  const n = ip.split(".").reduce((a, o) => (a << 8) + Number(o), 0) >>> 0;
  return PRIVATE_V4.some(([base, bits]) => (n >>> (32 - bits)) === (base >>> (32 - bits)));
}

export function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 4) return privateV4(ip);
  const v6 = ip.toLowerCase();
  const mapped = v6.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return privateV4(mapped[1]);
  return v6 === "::" || v6 === "::1" || /^f[cd]/.test(v6) || /^fe[89ab]/.test(v6) || /^ff/.test(v6);
}

/** The URL if it is https on a publicly routable host, else why not. */
export async function checkConnectorUrl(raw: string): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  let u: URL;
  try { u = new URL(raw.trim()); } catch { return { ok: false, error: "That isn't a valid URL." }; }
  if (u.protocol !== "https:") return { ok: false, error: "Connector URLs must use https." };
  if (u.username || u.password) return { ok: false, error: "Put credentials in the token field, not the URL." };
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (/^localhost$|\.local$|\.internal$|\.localhost$/i.test(host)) return { ok: false, error: "Connectors must be on the public internet." };
  const addrs = isIP(host) ? [host] : await lookup(host, { all: true }).then((r) => r.map((a) => a.address)).catch(() => []);
  if (!addrs.length) return { ok: false, error: `Couldn't find ${host}.` };
  if (addrs.some(isPrivateAddress)) return { ok: false, error: "Connectors must be on the public internet." };
  return { ok: true, url: u.toString() };
}

/** Lower-case slug, so tool names stay valid function names and can't contain the `__` separator. */
export function connectorSlug(name: string): string {
  return `u_${name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").replace(/__+/g, "_").slice(0, 24) || "connector"}`;
}

/** Shown in place of the stored URL, which may embed a key. */
export function maskUrl(url: string): string {
  try { const u = new URL(url); return `${u.host}${u.pathname.length > 1 ? "/…" : ""}`; } catch { return "invalid URL"; }
}

export async function userServers(email?: string): Promise<McpServer[]> {
  if (!email) return [];
  const db = getDb();
  if (!db) return [];
  const { data, error } = await db.from("user_connectors").select("name, url, token_enc").eq("user_id", email).eq("enabled", true);
  if (error || !Array.isArray(data)) return [];
  return (data as Array<{ name: string; url: string; token_enc: string | null }>).map((r) => {
    const token = r.token_enc ? decrypt(r.token_enc) : null;
    return { name: connectorSlug(r.name), url: r.url, user: true, ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}) };
  });
}
