"use client";

import { useCallback, useEffect, useState } from "react";
import { AudioLines, ExternalLink, Loader2, Play, Radio, RefreshCw, Rocket } from "lucide-react";
import type { AnchorOverview, AnchorRequest } from "@/lib/anchor";

const ACCENT = "#FF3B1F";

// ANCHOR autopilot's state and controls inside Jarvis. The robot itself runs on
// its own repo's GitHub Actions; these buttons start the same workflows as the
// Actions tab. Jarvis can do all of this from chat too ("run today's ANCHOR drop").

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "—");
const mmss = (s: number | null) => (s ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}` : "");

export function AnchorPanel() {
  const [data, setData] = useState<AnchorOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [song, setSong] = useState("");

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/tools/anchor");
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
      setData(d);
    } catch (e) { setError(e instanceof Error ? e.message : "Couldn't reach ANCHOR"); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function run(id: string, req: AnchorRequest, confirmText: string) {
    if (!confirm(confirmText)) return;
    setBusy(id); setMsg(null);
    try {
      const res = await fetch("/api/tools/anchor", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(req) });
      const d = await res.json().catch(() => ({}));
      setMsg({ ok: !!d.ok, text: d.message ?? d.error ?? `HTTP ${res.status}` });
      if (d.ok) setTimeout(load, 4000);
    } catch { setMsg({ ok: false, text: "Network error." }); }
    finally { setBusy(null); }
  }

  if (error) return <p className="text-sm text-accent-red">{error} <button onClick={load} className="underline ml-2">Retry</button></p>;
  if (!data) return <div className="flex items-center gap-2 text-text-muted text-sm"><Loader2 size={14} className="animate-spin" /> Reading ANCHOR…</div>;

  const last = data.lastRun;
  const btn = "flex items-center gap-1.5 px-3 py-1.5 rounded-input border border-border-default text-[11px] text-text-secondary hover:text-text-primary disabled:opacity-50";
  const primary = "flex items-center gap-1.5 px-3 py-1.5 rounded-input text-[11px] font-semibold text-[#07070F] hover:brightness-110 disabled:opacity-50";

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          ["Last run", last ? `${last.result === "ok" ? "✓" : "✗"} ${last.title ?? last.stage}` : "—", last?.finishedAt ? when(last.finishedAt) : ""],
          ["Next post", when(data.nextPostAt), ""],
          ["Streak", `${data.streak} days`, ""],
          ["Released", `${data.total} records`, ""],
        ].map(([label, value, sub]) => (
          <div key={label} className="rounded-card border border-border-default bg-background-surface/40 p-3">
            <div className="hud-label text-text-muted">{label}</div>
            <div className="text-sm font-semibold text-text-primary mt-1 truncate">{value}</div>
            {sub && <div className="text-[10px] font-mono text-text-muted">{sub}</div>}
          </div>
        ))}
      </div>
      {last?.error && <p className="text-xs text-accent-red">Last run failed at {last.stage}: {last.error}</p>}

      <div className="rounded-card border p-4 space-y-3" style={{ borderColor: ACCENT }}>
        <div className="flex items-center gap-2">
          <Rocket size={14} style={{ color: ACCENT }} />
          <span className="text-xs font-semibold text-text-primary">Controls</span>
          <a href={`https://github.com/${data.repo}/actions`} target="_blank" rel="noopener noreferrer" className="ml-auto inline-flex items-center gap-1 text-[11px] text-text-muted hover:text-text-primary">
            <ExternalLink size={11} /> Actions
          </a>
        </div>
        {!data.canRun && (
          <p className="text-[11px] text-text-muted">
            Read-only here: starting ANCHOR&apos;s workflows needs ANCHOR_GITHUB_TOKEN (Actions write on {data.repo}) and your account in ANCHOR_OPERATORS.
          </p>
        )}
        <div className="flex flex-wrap gap-1.5">
          <button disabled={!data.canRun || !!busy} className={primary} style={{ background: ACCENT }}
            onClick={() => run("drop", { action: "drop" }, "Start today's ANCHOR drop? It generates, releases and schedules the posts for 17:30 UTC.")}>
            {busy === "drop" ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />} Run today&apos;s drop
          </button>
          <button disabled={!data.canRun || !!busy} className={btn}
            onClick={() => run("rehearse", { action: "drop", dryRun: true }, "Rehearse today's drop? It renders only — nothing is released or posted.")}>
            {busy === "rehearse" ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />} Rehearse (render only)
          </button>
          <button disabled={!data.canRun || !!busy} className={btn}
            onClick={() => run("mix", { action: "mix", period: "week" }, "Build this week's continuous mix and publish it?")}>
            {busy === "mix" ? <Loader2 size={11} className="animate-spin" /> : <Radio size={11} />} Weekly mix
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5 items-center">
          <input value={song} onChange={(e) => setSong(e.target.value)} placeholder="Suno song link or id"
            className="flex-1 min-w-[220px] bg-background-base border border-border-default rounded-input px-2.5 py-1.5 text-xs text-text-primary outline-none" />
          <button disabled={!data.canRun || !!busy || !song.trim()} className={btn}
            onClick={() => run("queue", { action: "queue_song", song }, "Queue this Suno song for the next drop?")}>
            {busy === "queue" ? <Loader2 size={11} className="animate-spin" /> : <AudioLines size={11} />} Queue song
          </button>
        </div>
        {msg && <p className={`text-[11px] ${msg.ok ? "text-emerald-400" : "text-accent-red"}`}>{msg.text}</p>}
      </div>

      {data.runs.length > 0 && (
        <div>
          <div className="hud-label text-text-muted mb-2">Recent workflow runs</div>
          <div className="space-y-1">
            {data.runs.map((r) => (
              <a key={r.url} href={r.url} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 text-[11px] text-text-secondary hover:text-text-primary">
                <span className={r.conclusion === "success" ? "text-emerald-400" : r.conclusion ? "text-accent-red" : "text-warning"}>●</span>
                <span className="font-medium">{r.name}</span>
                <span className="text-text-muted">{r.conclusion ?? r.status}</span>
                <span className="ml-auto font-mono text-text-muted">{when(r.startedAt)}</span>
              </a>
            ))}
          </div>
        </div>
      )}

      <div>
        <div className="flex items-center gap-2 mb-2">
          <span className="hud-label text-text-muted">Releases</span>
          <a href={data.site} target="_blank" rel="noopener noreferrer" className="ml-auto inline-flex items-center gap-1 text-[11px] text-text-muted hover:text-text-primary">
            <ExternalLink size={11} /> {data.site.replace(/^https:\/\//, "")}
          </a>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {data.drops.slice(0, 12).map((d) => (
            <div key={d.id} className="rounded-card border border-border-default bg-background-surface/40 p-3 flex gap-3">
              {d.cover && <img src={d.cover} alt="" className="w-16 h-16 rounded object-cover flex-none" loading="lazy" />}
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-text-primary truncate">{d.title}</div>
                <div className="text-[10px] font-mono text-text-muted truncate">{d.date} · {d.lane}{d.bpm ? ` · ${d.bpm} BPM` : ""}{d.seconds ? ` · ${mmss(d.seconds)}` : ""}</div>
                <div className="flex gap-2 mt-1.5">
                  {d.youtubeUrl && <a href={d.youtubeUrl} target="_blank" rel="noopener noreferrer" className="text-text-muted hover:text-text-primary" aria-label="YouTube"><Play size={13} /></a>}
                  {d.shortUrl && <a href={d.shortUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] text-text-muted hover:text-text-primary">Short</a>}
                  {d.status && <span className="text-[10px] font-mono text-text-muted ml-auto">{d.status}</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
