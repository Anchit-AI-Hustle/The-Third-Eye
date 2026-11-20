import "server-only";

// Music Studio on ANCHOR's engine (Anchit, 2026-11-20: "Music studio in jarvis must use this
// exact architecture and logics to create music based on the prompts given").
//
// ANCHOR (github.com/Anchit-AI-Hustle/anchor-autopilot) makes its songs on Anchit's Mac GPU:
// the prompt picks one of the decided genre lanes, make_brief writes the producer's brief
// (caption, palette, groove, BPM, key, arrangement; the club cut for hard tech, acid and psy,
// full verses for rap), ACE-Step 1.5 XL renders several takes, and every take passes the tempo
// fix, the quality gate, the uniqueness check against every released song, the lyric check and
// the song gate before the best one is mastered (anchor/studio.py). Jarvis does not
// re-implement any of that: it writes the lyrics by ANCHOR's songbook guide, starts the
// repo's studio.yml with workflow_dispatch, and reads the song back from the release
// studio-<id>. Needs ANCHOR_GITHUB_TOKEN (actions: write on the repo), as the ANCHOR panel does.
import { randomBytes } from "crypto";
import { llmCascade } from "@/lib/llmCascade";
import { ANCHOR_REPO } from "@/lib/anchor";
import type { MusicInput } from "./types";

const API = `https://api.github.com/repos/${ANCHOR_REPO}`;
const RELEASE_HOST = `https://github.com/${ANCHOR_REPO}/releases/download/`;
export const ANCHOR_JOB = /^anchor[a-f0-9]{16}$/;
/** How long the Studio waits for the Mac (queue + up to six takes + gates). */
export const ANCHOR_GIVE_UP_MINUTES = 150;

export const anchorStudioConfigured = () => !!process.env.ANCHOR_GITHUB_TOKEN?.trim();

function headers(): HeadersInit {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${process.env.ANCHOR_GITHUB_TOKEN}`,
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

export interface AnchorRequest {
  id: string; prompt: string; title: string; lyrics: string; genre: string;
  bpm?: number; duration_s?: number; instrumental: boolean; voice?: string;
}

const RAP = /\b(rap|rapper|bars|hip[ -]?hop|boom ?bap|trap|drill|grime|phonk)\b/i;

/** ANCHOR's songbook guide (artist/songbook/GUIDE.md), the rules every book song follows. */
export function guideFor(rap: boolean): string {
  return [
    "You write one complete song for ANCHOR, a hard techno project, the way its songbook is written by hand.",
    "Rules (never break them):",
    "- A real human theme from the request: a night, a person, a fight, a win, a loss. Never robots, machines, systems, AI or the song itself.",
    "- The title is the hook: 2 to 4 words the crowd can shout, sung in the chorus or hook, never an existing song's title, no question titles.",
    "- Plain standard English words a singer pronounces clearly. No production notes, no stage directions, no brackets except section tags.",
    "- Section tags alone on their own line, bare: [Intro] [Verse 1] [Pre-Chorus] [Chorus] [Hook] [Drop] [Verse 2] [Bridge] [Final Chorus] [Outro]. Never a direction inside a tag.",
    "- One line is one bar. Put the stressed word on the beat; start lines with the important word, end them on the rhyme.",
    "- [Drop] sections carry at most one short chant line: the drop is music.",
    rap
      ? "- Model A (the dense chase): two verses of 8 to 12 lines, 16 to 22 syllables each, internal rhymes and rhyme chains, punchlines, a point of view; a one or two line hook; a chant drop; a whispered outro of 3 to 5 short lines."
      : "- Model B (the sung argument): two verses of 8 to 12 lines, 12 to 16 syllables each; a 4 line chorus with the title; a [Drop]; a bridge (the turn); a rewritten final chorus; a 2 line outro that returns to the intro.",
    'Return ONLY JSON: {"title": "...", "lyrics": "[Intro]\\n..."}',
  ].join("\n");
}

/** Title and lyrics written by the guide; the user's own lyrics are kept as they are. */
export async function anchorLyrics(i: MusicInput, fallback: { title?: string; lyrics: string }): Promise<{ title: string; lyrics: string }> {
  const own = i.lyricsMode === "manual" ? (i.lyricsText ?? "").trim() : "";
  const title = (i.title ?? "").trim();
  if (own) return { title: title || fallback.title || titleFrom(i.description ?? ""), lyrics: own };
  const rap = RAP.test(`${i.genre ?? ""} ${i.subgenre ?? ""} ${i.vocalStyle ?? ""} ${i.description ?? ""}`);
  try {
    const out = await llmCascade({
      system: guideFor(rap),
      messages: [{ role: "user", content: [
        `Request: ${i.description ?? ""}`,
        i.genre ? `Genre: ${i.genre}${i.subgenre ? ` / ${i.subgenre}` : ""}` : "",
        i.mood ? `Mood: ${i.mood}` : "",
        i.lyricsTheme ? `Theme: ${i.lyricsTheme}` : "",
        title ? `Title (keep it): ${title}` : "",
      ].filter(Boolean).join("\n") }],
      jsonMode: true, maxTokens: 1600, temperature: 0.85, stage: "music:anchor-lyrics",
    });
    const j = JSON.parse(out.text.slice(out.text.indexOf("{"), out.text.lastIndexOf("}") + 1)) as { title?: string; lyrics?: string };
    const lyrics = (j.lyrics ?? "").trim();
    if (/\[(verse|chorus|hook)/i.test(lyrics) && lyrics.length > 200) {
      return { title: title || (j.title ?? "").trim().slice(0, 60) || titleFrom(i.description ?? ""), lyrics: lyrics.slice(0, 6000) };
    }
  } catch { /* the four-agent lyrics below */ }
  return { title: title || fallback.title || titleFrom(i.description ?? ""), lyrics: fallback.lyrics.slice(0, 6000) };
}

export function titleFrom(text: string): string {
  const words = text.match(/[A-Za-z']+/g) ?? [];
  return words.slice(0, 3).map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase()).join(" ") || "Untitled";
}

/** The request ANCHOR's studio reads (anchor/studio.py). The genre text lets ANCHOR pick the lane. */
export function anchorRequest(i: MusicInput, words: { title: string; lyrics: string }, sing: boolean): AnchorRequest {
  const genre = [i.genre, i.subgenre].filter(Boolean).join(" ");
  const tempo = Number(i.tempo);
  const duration = Number(i.duration);
  return {
    id: anchorJobId(),
    prompt: [i.description, i.mood && `mood ${i.mood}`, i.instruments && `instruments ${i.instruments}`].filter(Boolean).join(", ").slice(0, 600),
    title: words.title.slice(0, 60),
    lyrics: sing ? words.lyrics : "",
    genre: genre.slice(0, 120),
    ...(tempo >= 100 && tempo <= 220 ? { bpm: Math.round(tempo) } : {}),
    ...(duration >= 60 ? { duration_s: Math.min(300, Math.round(duration)) } : {}),
    instrumental: !sing,
    ...(i.vocalStyle ? { voice: i.vocalStyle.slice(0, 160) } : {}),
  };
}

/** "anchor" + 8 hex of the start second + 8 random hex: the poll knows the job's age. */
export function anchorJobId(now = Date.now()): string {
  return `anchor${Math.floor(now / 1000).toString(16).padStart(8, "0").slice(-8)}${randomBytes(4).toString("hex")}`;
}
export const anchorJobStarted = (id: string) => parseInt(id.slice(6, 14), 16) * 1000;

/** Start the song on the Mac (studio.yml). Throws with GitHub's answer when it refuses. */
export async function startAnchorSong(r: AnchorRequest): Promise<void> {
  const res = await fetch(`${API}/actions/workflows/studio.yml/dispatches`, {
    method: "POST", headers: { ...headers(), "Content-Type": "application/json" },
    body: JSON.stringify({ ref: "main", inputs: { id: r.id, request: JSON.stringify(r) } }),
  });
  if (res.status !== 204) throw new Error(`ANCHOR studio could not start (GitHub ${res.status}: ${(await res.text()).slice(0, 200)})`);
}

export type AnchorPoll =
  | { status: "queued" | "processing"; message: string }
  | { status: "succeeded"; mp3Url: string; meta: Record<string, unknown> }
  | { status: "failed"; error: string; meta?: Record<string, unknown> };

interface Release { assets?: { name: string; browser_download_url: string }[] }
interface Run { display_title?: string; status?: string; conclusion?: string | null; html_url?: string }

/** Where the song is: on the Mac, held by the gates, or ready in its release. */
export async function pollAnchorSong(id: string, startedMs = anchorJobStarted(id)): Promise<AnchorPoll> {
  if (!ANCHOR_JOB.test(id)) return { status: "failed", error: "not an ANCHOR studio job" };
  const rel = await fetch(`${API}/releases/tags/studio-${id}`, { headers: headers(), cache: "no-store" });
  if (rel.ok) {
    const r = (await rel.json()) as Release;
    const asset = (n: (s: string) => boolean) => r.assets?.find((a) => n(a.name))?.browser_download_url;
    const metaUrl = asset((s) => s === "studio.json");
    const meta = metaUrl ? ((await (await fetch(metaUrl)).json().catch(() => ({}))) as Record<string, unknown>) : {};
    const mp3 = asset((s) => s.endsWith(".mp3"));
    if (mp3 && !meta.held && !meta.failed) return { status: "succeeded", mp3Url: mp3, meta };
    const why = Array.isArray(meta.why) ? (meta.why as string[]).slice(0, 3).join("; ") : "";
    return { status: "failed", meta, error: meta.held
      ? `ANCHOR's song gate held every take, so nothing shipped${why ? `: ${why}` : ""}. Try again for new takes.`
      : "ANCHOR's render failed on the Mac." };
  }
  const runs = await fetch(`${API}/actions/workflows/studio.yml/runs?per_page=30`, { headers: headers(), cache: "no-store" });
  const run = runs.ok
    ? ((await runs.json()) as { workflow_runs?: Run[] }).workflow_runs?.find((x) => x.display_title === `Music Studio ${id}`)
    : undefined;
  if (!run) {
    // GitHub lists a dispatched run a few seconds after the dispatch
    if (startedMs && Date.now() - startedMs > 10 * 60_000) return { status: "failed", error: "ANCHOR studio never started the song." };
    return { status: "queued", message: "Starting on ANCHOR's engine…" };
  }
  if (run.status === "completed") {
    return run.conclusion === "success"
      ? { status: "processing", message: "Handing the song back…" }
      : { status: "failed", error: `ANCHOR's run ended: ${run.conclusion ?? "unknown"}.` };
  }
  return run.status === "in_progress"
    ? { status: "processing", message: "Rendering takes on the Mac GPU and checking each one against ANCHOR's gates…" }
    : { status: "queued", message: "Waiting for the Mac to pick the song up (it renders when the Mac is awake)…" };
}

/** The finished MP3 from the release (only from this repo's release downloads). */
export async function fetchAnchorMp3(url: string): Promise<Buffer> {
  if (!url.startsWith(RELEASE_HOST)) throw new Error("unexpected audio location");
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`could not download the song (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}
