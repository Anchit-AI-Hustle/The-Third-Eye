import "server-only";

// ANCHOR autopilot (github.com/Anchit-AI-Hustle/anchor-autopilot) is the robot
// that releases one hard-techno track a day: brief, music, master, cover, the
// Short and the Reel, YouTube and Instagram. It runs on that repo's GitHub
// Actions; Jarvis reads the state the robot publishes (site/data/*.json) and
// starts its workflows through workflow_dispatch — the same buttons as the
// Actions tab, so nothing here re-implements the pipeline.

export const ANCHOR_REPO = process.env.ANCHOR_REPO || "Anchit-AI-Hustle/anchor-autopilot";
export const ANCHOR_SITE = process.env.ANCHOR_SITE || "https://anchor.anchit-tandon.com";
const RAW_SITE = `https://raw.githubusercontent.com/${ANCHOR_REPO}/main/site`;
const RAW = `${RAW_SITE}/data`;
const API = `https://api.github.com/repos/${ANCHOR_REPO}`;

export interface AnchorDrop {
  id: string;
  date: string;
  title: string;
  lane: string;
  bpm: number | null;
  key: string;
  seconds: number | null;
  cover: string | null;
  audioUrl: string | null;
  youtubeUrl: string | null;
  shortUrl: string | null;
  status: string;
  error: string | null;
}

export interface AnchorRun { name: string; status: string; conclusion: string | null; url: string; startedAt: string }

export interface AnchorOverview {
  lastRun: { result: string; stage: string; title: string | null; finishedAt: string | null; url: string | null; error: string | null } | null;
  nextPostAt: string | null;
  streak: number;
  total: number;
  drops: AnchorDrop[];
  runs: AnchorRun[];
  site: string;
  repo: string;
  canRun: boolean;
}

const str = (v: unknown) => (typeof v === "string" && v ? v : null);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

function headers(): HeadersInit {
  const token = process.env.ANCHOR_GITHUB_TOKEN;
  return { Accept: "application/vnd.github+json", ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

async function getJson(url: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(url, { ...init, next: { revalidate: 120 } } as RequestInit);
  if (!res.ok) throw new Error(`${url.startsWith(API) ? "GitHub" : "ANCHOR data"} answered ${res.status}`);
  return res.json();
}

export function toDrop(o: Record<string, unknown>): AnchorDrop {
  const cover = str(o.cover);
  return {
    id: String(o.id ?? o.date ?? ""),
    date: String(o.date ?? o.id ?? ""),
    title: String(o.title ?? "Untitled"),
    lane: String(o.lane_name ?? o.lane ?? ""),
    bpm: num(o.bpm),
    key: String(o.key ?? ""),
    seconds: num(o.duration_s),
    // From the repo rather than the site, so a cover shows even while the site is down.
    cover: cover ? (/^https?:/.test(cover) ? cover : `${RAW_SITE}/${cover.replace(/^\/+/, "")}`) : null,
    audioUrl: str(o.audio_url),
    youtubeUrl: str(o.youtube_url),
    shortUrl: str(o.short_url),
    status: String(o.status ?? ""),
    error: str(o.error),
  };
}

/** The operators allowed to start ANCHOR's workflows (ANCHOR_OPERATORS, comma-separated session ids). */
export function isAnchorOperator(user: string | null | undefined): boolean {
  const ops = (process.env.ANCHOR_OPERATORS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return !!user && ops.includes(user);
}

export async function anchorOverview(user: string | null | undefined): Promise<AnchorOverview> {
  const [status, catalog, runs] = await Promise.all([
    getJson(`${RAW}/status.json`) as Promise<Record<string, unknown>>,
    getJson(`${RAW}/catalog.json`) as Promise<{ drops?: Record<string, unknown>[] }>,
    (getJson(`${API}/actions/runs?per_page=8`, { headers: headers() }) as Promise<{ workflow_runs?: Record<string, unknown>[] }>)
      .catch(() => ({ workflow_runs: [] })),
  ]);
  const last = status.last_run as Record<string, unknown> | undefined;
  const drops = (catalog.drops ?? []).map(toDrop).sort((a, b) => b.date.localeCompare(a.date));
  return {
    lastRun: last ? {
      result: String(last.result ?? ""), stage: String(last.stage ?? ""), title: str(last.title),
      finishedAt: str(last.finished_at), url: str(last.run_url), error: str(last.error),
    } : null,
    nextPostAt: str(status.next_post_at),
    streak: num(status.streak) ?? 0,
    total: num((status.totals as Record<string, unknown> | undefined)?.drops) ?? drops.length,
    drops,
    runs: (runs.workflow_runs ?? []).map((r) => ({
      name: String(r.name ?? ""), status: String(r.status ?? ""), conclusion: str(r.conclusion),
      url: String(r.html_url ?? ""), startedAt: String(r.run_started_at ?? r.created_at ?? ""),
    })),
    site: ANCHOR_SITE,
    repo: ANCHOR_REPO,
    canRun: isAnchorOperator(user) && !!process.env.ANCHOR_GITHUB_TOKEN,
  };
}

/** ANCHOR's state in a few lines, for the assistant to read back. */
export async function anchorStatus(user: string | null | undefined): Promise<string> {
  let o: AnchorOverview;
  try { o = await anchorOverview(user); }
  catch (e) { return `ANCHOR's status couldn't be read: ${e instanceof Error ? e.message : "unreachable"}.`; }
  const last = o.lastRun;
  return [
    last ? `Last run: ${last.result}${last.title ? ` — "${last.title}"` : ""} at ${last.finishedAt ?? "?"}${last.error ? ` (failed at ${last.stage}: ${last.error})` : ""}.` : "No run recorded yet.",
    `Next post: ${o.nextPostAt ?? "not scheduled"}. Streak: ${o.streak} days. Released: ${o.total} records.`,
    `Latest releases:\n${o.drops.slice(0, 5).map((d) => `- ${d.date} "${d.title}" (${d.lane}${d.bpm ? `, ${d.bpm} BPM` : ""})${d.youtubeUrl ? ` ${d.youtubeUrl}` : ""}`).join("\n")}`,
    o.canRun ? "You can start a drop, rehearsal, queue or mix for them (they confirm first)." : "Starting workflows from here isn't set up for this account (needs ANCHOR_GITHUB_TOKEN and ANCHOR_OPERATORS); say so if asked.",
    `Panel: /tools/anchor · site: ${o.site}`,
  ].join("\n");
}

export type AnchorAction = "drop" | "queue_song" | "mix";

export interface AnchorRequest {
  action: AnchorAction;
  /** queue_song: a Suno song id or https://suno.com/song/… link. */
  song?: string;
  /** drop / queue_song: publish now instead of at the 17:30 UTC slot. */
  now?: boolean;
  /** drop / mix: render only — no release, website or YouTube. */
  dryRun?: boolean;
  /** mix: "week" or "month". */
  period?: "week" | "month";
}

/** The chat tool's arguments ({ action: "run_drop" | "rehearse" | …, song, now, period }) as a request. */
export function anchorRequestFrom(args: { action?: unknown; song?: unknown; now?: unknown; period?: unknown } | null | undefined): AnchorRequest {
  const a = args?.action;
  const base = { song: typeof args?.song === "string" ? args.song : undefined, now: args?.now === true, period: args?.period === "month" ? "month" as const : "week" as const };
  if (a === "queue_song") return { ...base, action: "queue_song" };
  if (a === "mix") return { ...base, action: "mix" };
  return { ...base, action: "drop", dryRun: a === "rehearse" };
}

const SUNO = /^(?:https:\/\/suno\.com\/song\/)?([0-9a-f-]{36})\/?$/i;

/** Validate a request into the workflow file and inputs it dispatches, or an error to show. */
export function anchorDispatch(r: AnchorRequest): { workflow: string; inputs: Record<string, string>; label: string } | { error: string } {
  switch (r.action) {
    case "drop":
      return {
        workflow: "daily.yml",
        inputs: { publish_now: String(!!r.now), dry_run: String(!!r.dryRun) },
        label: r.dryRun ? "a rehearsal of today's drop (render only)" : `today's drop${r.now ? ", published immediately" : ", posting at the 17:30 UTC slot"}`,
      };
    case "queue_song": {
      const id = SUNO.exec((r.song ?? "").trim())?.[1];
      if (!id) return { error: "Give a Suno song id or a https://suno.com/song/… link." };
      return {
        workflow: "queue-song.yml",
        inputs: { song: id, release_now: String(!!r.now) },
        label: `Suno song ${id} into the queue${r.now ? " and release it now" : ""}`,
      };
    }
    case "mix": {
      const period = r.period === "month" ? "month" : "week";
      return {
        workflow: "weekly-mix.yml",
        inputs: { period, dry_run: String(!!r.dryRun) },
        label: `the ${period}'s continuous mix${r.dryRun ? " (render only)" : ""}`,
      };
    }
    default:
      return { error: "Unknown ANCHOR action." };
  }
}

export async function runAnchor(user: string | null | undefined, r: AnchorRequest): Promise<{ ok: boolean; message: string }> {
  if (!isAnchorOperator(user)) return { ok: false, message: "Only ANCHOR's operators can start its workflows (ANCHOR_OPERATORS)." };
  if (!process.env.ANCHOR_GITHUB_TOKEN) return { ok: false, message: "ANCHOR_GITHUB_TOKEN isn't set — add a token with Actions write access to the anchor-autopilot repo." };
  const d = anchorDispatch(r);
  if ("error" in d) return { ok: false, message: d.error };
  const res = await fetch(`${API}/actions/workflows/${d.workflow}/dispatches`, {
    method: "POST",
    headers: { ...headers(), "Content-Type": "application/json" },
    body: JSON.stringify({ ref: "main", inputs: d.inputs }),
  }).catch(() => null);
  if (res?.status === 204) return { ok: true, message: `Started ${d.label}. Follow it at https://github.com/${ANCHOR_REPO}/actions/workflows/${d.workflow}` };
  const detail = res ? ((await res.json().catch(() => null)) as { message?: string } | null)?.message ?? `HTTP ${res.status}` : "network error";
  return { ok: false, message: `GitHub refused to start ${d.label}: ${detail}` };
}
