"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Clapperboard, Loader2, Film, Download, AlertTriangle } from "lucide-react";
import { recordGeneration } from "@/lib/generations";

interface Scene { n: number; title: string; seconds: number; prompt: string }
type ClipState = { status: "idle" | "rendering" | "done" | "error"; url?: string; msg?: string };

// Turns a finished Video Studio script into real clips. Deliberately one clip
// per click: this is the only surface in the app that spends money per call, so
// there is no "render all" button and nothing starts on its own.
export function VideoScenes({ script, title, accent }: { script: string; title: string; accent: string }) {
  const [scenes, setScenes] = useState<Scene[] | null>(null);
  const [planning, setPlanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clips, setClips] = useState<Record<number, ClipState>>({});
  const polls = useRef<Record<number, ReturnType<typeof setInterval>>>({});

  useEffect(() => { setScenes(null); setClips({}); setError(null); }, [script]);

  const stopPoll = useCallback((n: number) => {
    const t = polls.current[n];
    if (t) { clearInterval(t); delete polls.current[n]; }
  }, []);

  useEffect(() => {
    const active = polls.current;
    return () => { for (const t of Object.values(active)) clearInterval(t); };
  }, []);

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
      if (d.configured === false) setError("Shot list ready. Clip rendering needs REPLICATE_API_TOKEN — until it's set, these prompts are copy-paste ready for any video tool.");
    } catch {
      setError("Network error — please try again.");
    } finally { setPlanning(false); }
  }

  function poll(scene: Scene, jobId: string) {
    stopPoll(scene.n);
    polls.current[scene.n] = setInterval(async () => {
      try {
        const res = await fetch(`/api/tools/video?id=${encodeURIComponent(jobId)}`);
        const d = await res.json();
        if (d.status === "succeeded" && d.videoUrl) {
          stopPoll(scene.n);
          setClips((p) => ({ ...p, [scene.n]: { status: "done", url: d.videoUrl } }));
          recordGeneration({
            app: "video", appLabel: "Video Studio · Clip",
            title: `${title} — ${scene.n}. ${scene.title}`,
            kind: "video",
            inputs: [{ label: "Shot prompt", value: scene.prompt }, { label: "Length", value: `${scene.seconds}s` }],
            output: d.videoUrl,
            meta: { scene: scene.n, jobId },
          });
        } else if (d.status === "failed" || d.status === "canceled" || d.error) {
          stopPoll(scene.n);
          setClips((p) => ({ ...p, [scene.n]: { status: "error", msg: d.error || "Render failed." } }));
        }
      } catch { /* keep polling */ }
    }, 4000);
  }

  async function render(scene: Scene, index: number) {
    setClips((p) => ({ ...p, [scene.n]: { status: "rendering" } }));
    try {
      const res = await fetch("/api/tools/video", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ script, sceneIndex: index }),
      });
      const d = await res.json();
      if (!res.ok || !d.jobId) {
        setClips((p) => ({ ...p, [scene.n]: { status: "error", msg: d.error ?? `HTTP ${res.status}` } }));
        return;
      }
      poll(scene, d.jobId);
    } catch {
      setClips((p) => ({ ...p, [scene.n]: { status: "error", msg: "Network error." } }));
    }
  }

  return (
    <div className="border-t border-border-default p-5 space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <Clapperboard size={15} style={{ color: accent }} />
        <span className="hud-label" style={{ color: accent }}>Render clips</span>
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
          Break the script into shots, then render them one at a time. Each clip is a separate paid render of about {"4–8"} seconds — nothing renders until you press it.
        </p>
      )}

      {error && (
        <p className="flex items-start gap-1.5 text-xs text-warning">
          <AlertTriangle size={13} className="flex-none mt-0.5" />{error}
        </p>
      )}

      {scenes?.map((s, i) => {
        const c = clips[s.n] ?? { status: "idle" as const };
        return (
          <div key={s.n} className="rounded-input border border-border-default bg-background-base p-3 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold text-text-primary">{s.n}. {s.title}</span>
              <span className="text-[10px] font-mono text-text-muted">{s.seconds}s</span>
              <button onClick={() => render(s, i)} disabled={c.status === "rendering"}
                className="ml-auto flex items-center gap-1.5 px-2.5 py-1 rounded-input text-[11px] font-semibold text-[#07070F] hover:brightness-110 disabled:opacity-50"
                style={{ background: accent }}>
                {c.status === "rendering" ? <Loader2 size={11} className="animate-spin" /> : <Film size={11} />}
                {c.status === "rendering" ? "Rendering…" : c.status === "done" ? "Re-render" : "Render"}
              </button>
            </div>
            <p className="text-[11px] leading-relaxed text-text-secondary">{s.prompt}</p>
            {c.status === "error" && <p className="text-[11px] text-accent-red">{c.msg}</p>}
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
    </div>
  );
}
