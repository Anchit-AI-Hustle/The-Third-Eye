import { getServerSession } from "next-auth";
import type { NextRequest } from "next/server";
import { authOptions } from "@/lib/auth";
import { getAdminSupabase } from "@/lib/serverSupabase";
import { listConversations, setIncluded } from "@/lib/conversationSources";
import { discoverChatSpaces } from "@/lib/ingest";
import { byId, type ConnectorId } from "@/lib/connectors";

export const runtime = "nodejs";
export const maxDuration = 30;

// The conversation picker's read/write path.
//
// GET  — list what we've discovered for a connector, with each row's opt-in state.
//        ?discover=1 re-lists from the provider first, so a user who just connected
//        doesn't have to wait for the next cron poll to see their chats.
// PATCH — watch or un-watch specific conversations.
//
// Session-scoped: the signed-in email is the only user_id these ever touch, so one
// user can't read or edit another's selection even though the query runs as the
// service role.

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) return json({ error: "Not authenticated" }, 401);

  const connector = parseConnector(req.nextUrl.searchParams.get("connector"));
  if (!connector) return json({ error: "Unknown connector" }, 400);

  const sb = getAdminSupabase();
  if (!sb) return json({ error: "Supabase not configured" }, 501);

  // Best-effort: a provider hiccup shouldn't blank out the list we already have.
  let discoverError: string | null = null;
  if (req.nextUrl.searchParams.get("discover") === "1" && connector === "google-chat") {
    try {
      await discoverChatSpaces(sb, email);
    } catch (e) {
      discoverError = e instanceof Error ? e.message : String(e);
    }
  }

  const conversations = await listConversations(sb, email, connector);
  return json({ connector, conversations, discoverError });
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) return json({ error: "Not authenticated" }, 401);

  const body = (await req.json().catch(() => ({}))) as {
    connector?: string;
    conversationIds?: unknown;
    included?: unknown;
  };

  const connector = parseConnector(body.connector);
  if (!connector) return json({ error: "Unknown connector" }, 400);

  const ids = Array.isArray(body.conversationIds)
    ? body.conversationIds.filter((v): v is string => typeof v === "string" && !!v)
    : [];
  if (!ids.length) return json({ error: "No conversations given" }, 400);
  if (typeof body.included !== "boolean") return json({ error: "`included` must be a boolean" }, 400);

  const sb = getAdminSupabase();
  if (!sb) return json({ error: "Supabase not configured" }, 501);

  const { updated } = await setIncluded(sb, email, connector, ids, body.included);
  return json({ updated });
}

/** Only ids in the registry, so a caller can't write arbitrary connector strings. */
function parseConnector(v: string | null | undefined): ConnectorId | null {
  return v && byId(v as ConnectorId) ? (v as ConnectorId) : null;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
