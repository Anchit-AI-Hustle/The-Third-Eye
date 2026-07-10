import type { NextRequest } from "next/server";
import { getAdminSupabase } from "@/lib/serverSupabase";
import { getGoogleAccessToken } from "@/lib/googleToken";
import { extractMeetingTasks } from "@/lib/extract";
import { saveExtractedTasks } from "@/lib/tasks";
import { logActivity } from "@/lib/activity";
import { cronAuthorized, connectedGoogleUsers, alreadyProcessed, markProcessed, type Sb } from "@/lib/cron";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_SPACES = 15;
const MAX_MSGS_PER_SPACE = 25;

// Vercel Cron: poll each connected user's Google Chat spaces for new messages
// since a per-space high-water mark, extract tasks, and dedup/merge. Opt-in —
// only runs for users who granted the Chat scopes via /api/connect/google.
export async function GET(req: NextRequest) {
  if (!cronAuthorized(req)) return new Response("Unauthorized", { status: 401 });
  const sb = getAdminSupabase();
  if (!sb) return Response.json({ error: "Supabase not configured" }, { status: 501 });

  const users = await connectedGoogleUsers(sb);
  const summary: Record<string, unknown> = {};
  for (const email of users) {
    try {
      summary[email] = await scrapeUser(sb, email);
    } catch (e) {
      summary[email] = { error: e instanceof Error ? e.message : String(e) };
    }
  }
  return Response.json({ users: users.length, summary });
}

interface ChatMsg {
  name?: string;
  text?: string;
  createTime?: string;
  sender?: { displayName?: string };
}

async function gget(access: string, url: string) {
  const r = await fetch(url, { headers: { Authorization: `Bearer ${access}` } });
  if (!r.ok) throw new Error(`chat ${r.status}`);
  return r.json();
}

async function watermark(sb: Sb, email: string, space: string): Promise<string | null> {
  const { data } = await sb
    .from("chat_watermarks").select("last_create_time")
    .eq("user_id", email).eq("space_name", space).maybeSingle();
  return (data as { last_create_time?: string } | null)?.last_create_time ?? null;
}

async function setWatermark(sb: Sb, email: string, space: string, ts: string): Promise<void> {
  await sb.from("chat_watermarks").upsert(
    { user_id: email, space_name: space, last_create_time: ts, updated_at: new Date().toISOString() },
    { onConflict: "user_id,space_name" },
  );
}

async function scrapeUser(sb: Sb, email: string) {
  const tok = await getGoogleAccessToken(email);
  if (!tok || !(tok.scope ?? "").includes("chat.messages.readonly")) return { skipped: "chat not connected" };
  const access = tok.accessToken;

  const spacesRes = (await gget(access, "https://chat.googleapis.com/v1/spaces?pageSize=100")) as {
    spaces?: { name?: string }[];
  };
  const spaces = (spacesRes.spaces ?? []).map((s) => s.name).filter((n): n is string => !!n).slice(0, MAX_SPACES);

  let processed = 0, inserted = 0, merged = 0;
  for (const space of spaces) {
    const since = await watermark(sb, email, space);
    const filter = since ? `&filter=${encodeURIComponent(`createTime > "${since}"`)}` : "";
    let res: { messages?: ChatMsg[] };
    try {
      res = (await gget(
        access,
        `https://chat.googleapis.com/v1/${space}/messages?pageSize=${MAX_MSGS_PER_SPACE}&orderBy=${encodeURIComponent("createTime desc")}${filter}`,
      )) as { messages?: ChatMsg[] };
    } catch {
      continue; // a single locked space shouldn't stop the rest
    }
    const msgs = (res.messages ?? []).slice().sort((a, b) => (a.createTime ?? "").localeCompare(b.createTime ?? ""));
    for (const m of msgs) {
      const id = (m.name ?? "").split("/").pop() ?? "";
      const text = (m.text ?? "").trim();
      if (m.createTime) await setWatermark(sb, email, space, m.createTime);
      if (!id || !text) continue;
      if (await alreadyProcessed(sb, email, "chat", id)) continue;

      const ex = await extractMeetingTasks({
        startedAt: m.createTime ?? new Date().toISOString(),
        transcript: text,
        defaultOwner: m.sender?.displayName ?? null,
      });
      if (ex.tasks.length) {
        const bare = space.replace(/^spaces\//, "");
        const r = await saveExtractedTasks(
          {
            userId: email,
            sourceType: "Chat",
            sourceRefId: `chat:${id}`,
            sourceDetail: `Google Chat${m.sender?.displayName ? ` with ${m.sender.displayName}` : ""}`,
            sourceLink: `https://mail.google.com/chat/u/0/#chat/space/${bare}`,
            dateGiven: m.createTime ?? null,
          },
          ex.tasks,
        );
        inserted += r.inserted;
        merged += r.merged;
      }
      await markProcessed(sb, email, "chat", id);
      processed++;
    }
  }

  if (processed) {
    await logActivity(email, "ingestion", `Chat scan: ${processed} new message(s)`, {
      detail: `${inserted} task(s) created, ${merged} merged`,
      context: { processed, inserted, merged, spaces: spaces.length },
    });
  }
  return { processed, inserted, merged, spaces: spaces.length };
}
