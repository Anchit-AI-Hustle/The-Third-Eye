"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Clapperboard, Loader2, Film, Download, AlertTriangle, Mic, Tv } from "lucide-react";
import { recordGeneration } from "@/lib/generations";
import { assembleEpisode } from "@/lib/episodeVideo";

interface Scene { n: number; title: string; seconds: number; prompt: string; narration: string }
type JobState = { status: "idle" | "rendering" | "done" | "error"; url?: string; msg?: string };
type Episode = { status: "idle" | "building" | "done" | "error"; progress?: number; url?: string; ext?: string; msg?: string };

// Turns a finished Video Studio script into real clips, then into one episode
// file. Deliberately one paid job per click: this is the only surface in the app
// that spends money per call, so there is no "render all" button and nothing
// starts on its own. Assembling the episode is free — it happens in the browser.
export function VideoScenes({ script, title, accent }: { script: string; title: string; accent: string }) {
  const [scenes, setScenes] = useState<Scene[] | null>(null);
  const [planning, setPlanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clips, setClips] = useState<Record<number, JobState>>({});
  const [voices, setVoices] = useState<Record<number, JobState>>({});
  const [episode, setEpisode] = useState<Episode>({ status: "idle" });
  const polls = useRef<Record<string, ReturnType<typeof setInterval>>>({});

  useEffect(() => { setScenes(null); setClips({}); setVoices({}); setEpisode({ status: "idle" }); setError(null); }, [script]);

  const stopPoll = useCallback((key: string) => {
    const t = polls.current[key];
    if (t) { clearInterval(t); delete polls.current[key]; }
  }, []);

  useEffect(() => {
    const active = polls.current;
    return () => { for (const t of Object.values(active)) clearInterval(t); };
  }, []);

  useEffect(() => () => { if (episode.url) URL.revokeObjectURL(episode.url); }, [episode.url]);

  async function plan() {
    setPlanning(true); setError(null);
    try {
      const res = await fetch("/api/tools/video", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ script }),
      });
      const d = await res.json();
      if (!res.ok) { setError(d.error ?? `HTTP ${res.status}`); return; }
      setScenes(d.scenes ?? []);
      if (d.configured === false) setError("Shot list ready. Rendering needs REPLICATE_API_TOKEN — until it's set, these prompts are copy-paste ready for any video tool.");
    } catch {
      setError("Network error — please try again.");
    } finally { setPlanning(false); }
  }

  // Clips and voice-overs are the same submit-then-poll job; only the payload and
  // where the result lands differ.
  async function submit(
    kind: "clip" | "voice",
    scene: Scene,
    set: typeof setClips,
    onDone?: (url: string, jobId: string) => void,
  ) {
    const key = `${kind}:${scene.n}`;
    set((p) => ({ ...p, [scene.n]: { status: "rendering" } }));
    const fail = (msg: string) => set((p) => ({ ...p, [scene.n]: { status: "error", msg } }));
    try {
      const res = await fetch("/api/tools/video", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(kind === "clip" ? { scene: { prompt: scene.prompt, seconds: scene.seconds } } : { narration: scene.narration }),
      });
      const d = await res.json();
      if (!res.ok || !d.jobId) return fail(d.error ?? `HTTP ${res.status}`);
      stopPoll(key);
      polls.current[key] = setInterval(async () => {
        try {
          const r = await fetch(`/api/tools/video?id=${encodeURIComponent(d.jobId)}`);
          const s = await r.json();
          if (s.status === "succeeded" && s.url) {
            stopPoll(key);
            set((p) => ({ ...p, [scene.n]: { status: "done", url: s.url } }));
            onDone?.(s.url, d.jobId);
          } else if (s.status === "failed" || s.status === "canceled" || s.error) {
            stopPoll(key);
            fail(s.error || "Render failed.");
          }
        } catch { /* keep polling */ }
      }, 4000);
    } catch {
      fail("Network error.");
    }
  }

  const renderClip = (scene: Scene) =>
    submit("clip", scene, setClips, (url, jobId) =>
      recordGeneration({
        app: "video", appLabel: "Video Studio · Clip",
        title: `${title} — ${scene.n}. ${scene.title}`,
        kind: "video",
        inputs: [{ label: "Shot prompt", value: scene.prompt }, { label: "Length", value: `${scene.seconds}s` }],
        output: url,
        meta: { scene: scene.n, jobId },
      }));

  const ready = scenes?.filter((s) => clips[s.n]?.status === "done") ?? [];

  async function buildEpisode() {
    if (!scenes) return;
    setEpisode({ status: "building", progress: 0 });
    try {
      const { blob, ext } = await assembleEpisode({
        title,
        shots: ready.map((s) => ({
          title: s.title,
          clipUrl: clips[s.n].url!,
          narration: s.narration,
          voiceUrl: voices[s.n]?.status === "done" ? voices[s.n].url : undefined,
        })),
        onProgress: (p) => setEpisode((e) => (e.status === "building" ? { ...e, progress: p } : e)),
      });
      setEpisode({ status: "done", url: URL.createObjectURL(blob), ext });
    } catch (e) {
      setEpisode({ status: "error", msg: e instanceof Error ? e.message : "Could not build the episode." });
    }
  }

  const skipped = scenes ? scenes.length - ready.length : 0;
  const fileName = `${title.replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").toLowerCase() || "episode"}.${episode.ext ?? "webm"}`;

  return (
    <div className="border-t border-border-default p-5 space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <Clapperboard size={15} style={{ color: accent }} />
        <span className="hud-label" style={{ color: accent }}>Render episode</span>
        {!scenes && (
          <button onClick={plan} disabled={planning}
            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-input border border-border-default text-[11px] text-text-secondary hover:text-text-primary disabled:opacity-50">
            {planning ? <Loader2 size={12} className="animate-spin" /> : <Film size={12} />}
            {planning ? "Breaking down…" : "Build shot list"}
          </button>
        )}
      </div>

      {!scenes && !planning && (
        <p className="text-xs text-text-muted">
          Break the script into shots, render them one at a time, add voice-over, then assemble one episode file. Each clip and each voice-over is a separate paid render — nothing renders until you press it.
        </p>
      )}

      {error && (
        <p className="flex items-start gap-1.5 text-xs text-warning">
          <AlertTriangle size={13} className="flex-none mt-0.5" />{error}
        </p>
      )}

      {scenes?.map((s) => {
        const c = clips[s.n] ?? { status: "idle" as const };
        const v = voices[s.n] ?? { status: "idle" as const };
        return (
          <div key={s.n} className="rounded-input border border-border-default bg-background-base p-3 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold text-text-primary">{s.n}. {s.title}</span>
              <span className="text-[10px] font-mono text-text-muted">{s.seconds}s</span>
              <div className="ml-auto flex items-center gap-1.5">
                {s.narration && (
                  <button onClick={() => submit("voice", s, setVoices)} disabled={v.status === "rendering"}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-input border border-border-default text-[11px] text-text-secondary hover:text-text-primary disabled:opacity-50">
                    {v.status === "rendering" ? <Loader2 size={11} className="animate-spin" /> : <Mic size={11} />}
                    {v.status === "rendering" ? "Voicing…" : v.status === "done" ? "Re-voice" : "Voice"}
                  </button>
                )}
                <button onClick={() => renderClip(s)} disabled={c.status === "rendering"}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-input text-[11px] font-semibold text-[#07070F] hover:brightness-110 disabled:opacity-50"
                  style={{ background: accent }}>
                  {c.status === "rendering" ? <Loader2 size={11} className="animate-spin" /> : <Film size={11} />}
                  {c.status === "rendering" ? "Rendering…" : c.status === "done" ? "Re-render" : "Render"}
                </button>
              </div>
            </div>
            <p className="text-[11px] leading-relaxed text-text-secondary">{s.prompt}</p>
            {s.narration && (
              <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-text-primary">
                <Mic size={11} className="flex-none mt-0.5 text-text-muted" />“{s.narration}”
              </p>
            )}
            {c.status === "error" && <p className="text-[11px] text-accent-red">{c.msg}</p>}
            {v.status === "error" && <p className="text-[11px] text-accent-red">Voice-over: {v.msg}</p>}
            {v.status === "done" && v.url && <audio controls src={v.url} className="w-full h-8" />}
            {c.status === "done" && c.url && (
              <div className="space-y-1.5">
                <video controls src={c.url} className="w-full rounded-input bg-black" />
                <a href={c.url} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] text-text-muted hover:text-text-primary">
                  <Download size={11} /> Save clip — the provider link expires in about an hour
                </a>
              </div>
            )}
          </div>
        );
      })}

      {scenes && (
        <div className="rounded-input border p-3 space-y-2" style={{ borderColor: accent }}>
          <div className="flex items-center gap-2 flex-wrap">
            <Tv size={14} style={{ color: accent }} />
            <span className="text-xs font-semibold text-text-primary">Episode file</span>
            <button onClick={buildEpisode} disabled={!ready.length || episode.status === "building"}
              className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-input text-[11px] font-semibold text-[#07070F] hover:brightness-110 disabled:opacity-50"
              style={{ background: accent }}>
              {episode.status === "building" ? <Loader2 size={12} className="animate-spin" /> : <Tv size={12} />}
              {episode.status === "building" ? `Assembling… ${Math.round((episode.progress ?? 0) * 100)}%` : episode.status === "done" ? "Rebuild episode" : "Build episode file"}
            </button>
          </div>
          <p className="text-[11px] text-text-muted">
            {ready.length
              ? `Title card, ${ready.length} shot${ready.length === 1 ? "" : "s"} with subtitles${Object.values(voices).some((v) => v.status === "done") ? " and voice-over" : ""}, end card — assembled in your browser in real time, so keep this tab in front.${skipped ? ` ${skipped} unrendered shot${skipped === 1 ? " is" : "s are"} left out.` : ""}`
              : "Render at least one shot to assemble an episode."}
          </p>
          {episode.status === "error" && <p className="text-[11px] text-accent-red">{episode.msg}</p>}
          {episode.status === "done" && episode.url && (
            <div className="space-y-1.5">
              <video controls src={episode.url} className="w-full rounded-input bg-black" />
              <a href={episode.url} download={fileName}
                className="inline-flex items-center gap-1 text-[11px] font-semibold hover:brightness-110" style={{ color: accent }}>
                <Download size={11} /> Download {fileName}
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
