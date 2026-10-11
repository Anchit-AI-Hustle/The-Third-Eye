import { randomUUID } from "crypto";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { encrypt } from "@/lib/crypto";
import { probeServer, resetMcpCache } from "@/lib/mcp/client";
import { checkConnectorUrl, connectorSlug, maskUrl } from "@/lib/mcp/userConnectors";

export const runtime = "nodejs";

const MAX_CONNECTORS = 10;

async function ctx() {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) return { error: Response.json({ error: "Not authenticated" }, { status: 401 }) };
  const db = getDb();
  if (!db) return { error: Response.json({ error: "Storage not configured" }, { status: 501 }) };
  return { email, db };
}

interface Row { id: string; name: string; url: string; enabled: boolean; tool_count: number; created_at: string }

export async function GET() {
  const c = await ctx();
  if ("error" in c) return c.error;
  const { data, error } = await c.db.from("user_connectors").select("id, name, url, enabled, tool_count, created_at")
    .eq("user_id", c.email).order("created_at", { ascending: true });
  if (error) return Response.json({ error: "Read failed" }, { status: 500 });
  // The URL may embed a key, so only its host goes back to the browser.
  return Response.json({ connectors: ((data ?? []) as Row[]).map(({ url, ...r }) => ({ ...r, host: maskUrl(url) })) });
}

export async function POST(req: Request) {
  const c = await ctx();
  if ("error" in c) return c.error;
  const body = await req.json().catch(() => ({}));
  const name = String(body?.name ?? "").trim().slice(0, 40);
  const token = String(body?.token ?? "").trim();
  if (!name) return Response.json({ error: "Give the connector a name." }, { status: 400 });
  const check = await checkConnectorUrl(String(body?.url ?? ""));
  if (!check.ok) return Response.json({ error: check.error }, { status: 400 });

  const { data: existing } = await c.db.from("user_connectors").select("id, name").eq("user_id", c.email);
  const rows = (existing ?? []) as Array<{ name: string }>;
  if (rows.length >= MAX_CONNECTORS) return Response.json({ error: `Up to ${MAX_CONNECTORS} connectors.` }, { status: 400 });
  if (rows.some((r) => connectorSlug(r.name) === connectorSlug(name))) {
    return Response.json({ error: "You already have a connector with that name." }, { status: 400 });
  }

  // Prove it speaks MCP before saving, so a typo fails here rather than in chat.
  let toolCount: number;
  try {
    toolCount = await probeServer({ name: connectorSlug(name), url: check.url, user: true, ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}) });
  } catch (err) {
    return Response.json({ error: `Couldn't reach it as an MCP server: ${err instanceof Error ? err.message : "no response"}` }, { status: 400 });
  }

  const tokenEnc = token ? encrypt(token) : null;
  if (token && !tokenEnc) return Response.json({ error: "Token storage isn't configured on this deployment." }, { status: 501 });
  const row = { user_id: c.email, id: randomUUID(), name, url: check.url, token_enc: tokenEnc, enabled: true, tool_count: toolCount };
  const { error } = await c.db.from("user_connectors").insert(row);
  if (error) return Response.json({ error: "Save failed" }, { status: 500 });
  resetMcpCache(c.email);
  return Response.json({ connector: { id: row.id, name, host: maskUrl(check.url), enabled: true, tool_count: toolCount } });
}

export async function PATCH(req: Request) {
  const c = await ctx();
  if ("error" in c) return c.error;
  const body = await req.json().catch(() => ({}));
  if (typeof body?.id !== "string" || typeof body?.enabled !== "boolean") {
    return Response.json({ error: "id and enabled required" }, { status: 400 });
  }
  const { error } = await c.db.from("user_connectors").update({ enabled: body.enabled }).eq("id", body.id).eq("user_id", c.email);
  if (error) return Response.json({ error: "Update failed" }, { status: 500 });
  resetMcpCache(c.email);
  return Response.json({ ok: true });
}

export async function DELETE(req: Request) {
  const c = await ctx();
  if ("error" in c) return c.error;
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return Response.json({ error: "id required" }, { status: 400 });
  const { error } = await c.db.from("user_connectors").delete().eq("id", id).eq("user_id", c.email);
  if (error) return Response.json({ error: "Delete failed" }, { status: 500 });
  resetMcpCache(c.email);
  return Response.json({ ok: true });
}
