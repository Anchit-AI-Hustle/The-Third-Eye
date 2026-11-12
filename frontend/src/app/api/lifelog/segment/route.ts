import { identify } from "@/lib/serverIdentity";
import { getDb } from "@/lib/db";
import { saveLifeActions } from "@/lib/lifelog/actions";
import { extractDay } from "@/lib/lifelog/extract";
import { askInChat } from "@/lib/askInChat";
import { sendPush } from "@/lib/push";
import type { LogEvent, LogSegment } from "@/lib/lifelog/types";

export const runtime = "nodejs";
export const maxDuration = 60;

// Where recorders that run with the app closed deliver each chunk: the Android
// app's listening service (session cookie) and the computer listener (token). The day lives on the
// server here, and every few transcribed chunks it is re-read into a timeline
// with its follow-ups saved as tasks and reminders.

const EXTRACT_EVERY = 3;

const local = (ts: number, offsetMin: number) => new Date(ts - offsetMin * 60_000).toISOString();

export async function POST(req: Request) {
  const { email } = await identify(req.headers, "lifelog");
  if (!email) return Response.json({ error: "unauthenticated" }, { status: 401 });
  const b = (await req.json().catch(() => null)) as { segment?: Partial<LogSegment>; tzOffset?: number } | null;
  const s = b?.segment;
  if (!s?.id || typeof s.startTs !== "number" || typeof s.endTs !== "number") return Response.json({ error: "segment required" }, { status: 400 });
  const sb = getDb();
  if (!sb) return Response.json({ error: "Life Log sync needs the database." }, { status: 501 });

  const tz = Number(b!.tzOffset) || 0;
  const date = local(s.startTs, tz).slice(0, 10);
  const segment: LogSegment = {
    id: String(s.id).slice(0, 80), startTs: s.startTs, endTs: s.endTs,
    transcript: String(s.transcript ?? "").slice(0, 8000), hasAudio: false,
    provider: s.provider ? String(s.provider).slice(0, 40) : undefined, silent: s.silent === true,
  };

  const { data: row } = await sb.from("lifelog_days").select("segments, events, diary, summary").eq("user_id", email).eq("id", date).maybeSingle();
  const segments = ((row?.segments ?? []) as LogSegment[]).filter((x) => x.id !== segment.id).concat(segment).sort((a, c) => a.startTs - c.startTs);
  const day = { user_id: email, id: date, date, segments, events: row?.events ?? [], diary: row?.diary ?? [], summary: row?.summary ?? "", updated_at: new Date().toISOString() };

  const spoken = segments.filter((x) => x.transcript);
  let followUps = 0;
  if (segment.transcript && spoken.length % EXTRACT_EVERY === 0) {
    const transcript = spoken.map((x) => `[${local(x.startTs, tz).slice(11, 16)}] ${x.transcript}`).join("\n");
    const out = await extractDay(transcript, date);
    if (out) {
      const base = segments[0].startTs;
      day.events = out.events.map((e, i): LogEvent => ({
        id: `${date}-${i}`,
        ts: e.time ? Date.parse(`${date}T${e.time.padStart(5, "0")}:00Z`) + tz * 60_000 : base,
        title: e.title, kind: e.kind, detail: e.detail,
      })).sort((a, c) => a.ts - c.ts);
      if (out.summary) day.summary = out.summary;
      const saved = (await saveLifeActions(email, date, out.actions, tz).catch(() => [])).filter((a) => a.saved && !a.note);
      followUps = saved.length;
      const mine = saved.filter((a) => a.needsYou);
      if (mine.length) {
        await askInChat(sb, email, `From what I heard just now, these need you - I've added them to Tasks:\n\n${mine.map((a) => `- ${a.title}${a.when ? ` (${a.when.replace("T", " ")})` : ""}`).join("\n")}\n\nWant me to set reminders, draft anything, or plan them into your day?`).catch(() => {});
      } else if (saved.length) await sendPush(email, "JARVIS is on it", `${saved.length} follow-up${saved.length === 1 ? "" : "s"} from your day added to Tasks.`, "/tasks").catch(() => false);
    }
  }

  const { error } = await sb.from("lifelog_days").upsert(day, { onConflict: "user_id,id" });
  if (error) return Response.json({ error: "Couldn't save the recording." }, { status: 500 });
  return Response.json({ ok: true, date, followUps });
}
