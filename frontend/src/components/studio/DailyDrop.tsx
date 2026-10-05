"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarClock, Download, Loader2, RefreshCw, Save, Sparkles } from "lucide-react";
import { AiFieldBar } from "@/components/studio/AiFieldBar";

// The daily drop: save the current Music Studio form as a style, and the daily
// cron makes a new song in it every morning (lib/music/daily.ts).

interface Settings { enabled: boolean; preset: { genre?: string; tempo?: number; title?: string }; refs: string; updated_at: string }
interface Track {
  id: string; day: string; title: string; theme: string; lyrics: string; bpm: number | null;
  status: "pending" | "done" | "failed"; error: string | null; size: number | null;
}

const API = "/api/tools/music/daily";

function useDaily() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(API);
      if (!r.ok) return;
      const d = await r.json();
      setSettings(d.settings ?? null);
      setTracks(d.tracks ?? []);
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  return { settings, tracks, loading, load };
}

export function DailyDrop({ preset, context = {} }: { preset: () => Record<string, unknown>; context?: Record<string, string> }) {
  const { settings, load } = useDaily();
  const [refs, setRefs] = useState("");
  const [busy, setBusy] = useState<"save" | "run" | "toggle" | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => { if (settings) setRefs(settings.refs); }, [settings]);

  async function save(enabled: boolean, p = preset()) {
    const r = await fetch(API, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled, preset: p, refs }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error ?? `HTTP ${r.status}`);
    await load();
  }

  async function act(kind: "save" | "run" | "toggle") {
    setBusy(kind); setMsg(null);
    try {
      if (kind === "save") { await save(true); setMsg("Saved — a new track in this style arrives every morning."); }
      else if (kind === "toggle" && settings) { await save(!settings.enabled, settings.preset); }
      else {
        const r = await fetch(API, { method: "POST" });
        const d = await r.json().catch(() => ({}));
        setMsg(d.message ?? d.error ?? `HTTP ${r.status}`);
      }
    } catch (e) { setMsg(e instanceof Error ? e.message : "Something went wrong."); }
    finally { setBusy(null); }
  }

  return (
    <div className="rounded-input border border-[#34D399]/30 bg-[#34D399]/[0.04] p-3 space-y-2">
      <div className="flex items-center gap-2">
        <CalendarClock size={14} className="text-[#34D399]" />
        <span className="text-xs font-semibold text-text-primary">Daily drop</span>
        {settings && (
          <button onClick={() => act("toggle")} disabled={!!busy}
            className={`ml-auto relative w-9 h-5 rounded-full transition-colors disabled:opacity-50 ${settings.enabled ? "bg-[#34D399]" : "bg-border-default"}`}
            title={settings.enabled ? "Pause daily tracks" : "Resume daily tracks"}>
            <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${settings.enabled ? "left-4" : "left-0.5"}`} />
          </button>
        )}
      </div>
      <p className="text-[11px] text-text-muted">
        {settings
          ? `${settings.enabled ? "On" : "Paused"} — ${[settings.preset.genre, settings.preset.tempo && `${settings.preset.tempo} BPM`].filter(Boolean).join(" · ")}. A new song in this style every morning (around 07:00 IST); the last 7 are kept in Library.`
          : "Save this form as your style and a new, different song in it is made every morning (around 07:00 IST). The last 7 are kept in Library."}
      </p>
      <div className="flex items-center text-[11px] text-text-secondary">
        <span>Reference tracks</span>
        <AiFieldBar tool={{ label: "Music Studio", purpose: "artists or tracks a daily song should sound like" }}
          field={{ name: "refs", label: "Reference tracks", type: "text", placeholder: "artists or your own track titles" }}
          value={refs} context={context} onChange={setRefs} />
      </div>
      <input value={refs} onChange={(e) => setRefs(e.target.value)} maxLength={300}
        placeholder="Your tracks it should sound like — e.g. Project Mayhem, Underground Fever Dream"
        className="w-full bg-background-base border border-border-default rounded-input px-3 py-1.5 text-xs text-text-primary placeholder:text-text-muted outline-none focus:border-[#34D399]" />
      <div className="flex flex-wrap gap-2">
        <button onClick={() => act("save")} disabled={!!busy}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-input border border-[#34D399]/40 text-[11px] text-[#34D399] hover:bg-[#34D399]/10 disabled:opacity-50">
          {busy === "save" ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />}
          {settings ? "Update daily style from this form" : "Save as my daily style"}
        </button>
        {settings && (
          <button onClick={() => act("run")} disabled={!!busy}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-input border border-border-default text-[11px] text-text-secondary hover:text-text-primary disabled:opacity-50">
            {busy === "run" ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
            Make today's now
          </button>
        )}
      </div>
      {msg && <p className="text-[11px] text-text-secondary">{msg}</p>}
    </div>
  );
}

/** Reassemble a daily track from byte ranges — no single response may carry the whole file. */
export async function fetchDailyAudio(id: string): Promise<Blob> {
  const url = `${API}/${id}`;
  const parts: ArrayBuffer[] = [];
  let start = 0, total = Infinity, type = "audio/mpeg";
  while (start < total) {
    const r = await fetch(url, { headers: { Range: `bytes=${start}-` } });
    if (r.status !== 206) throw new Error(`Download failed (HTTP ${r.status})`);
    total = Number(/\/(\d+)$/.exec(r.headers.get("content-range") ?? "")?.[1]);
    type = r.headers.get("content-type") ?? type;
    const b = await r.arrayBuffer();
    if (!b.byteLength || !Number.isFinite(total)) throw new Error("Download failed");
    parts.push(b);
    start += b.byteLength;
  }
  return new Blob(parts, { type });
}

async function download(t: Track) {
  const blob = await fetchDailyAudio(t.id);
  const type = blob.type;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${t.title}.${type.includes("wav") ? "wav" : type.includes("flac") ? "flac" : "mp3"}`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

export function DailyTracks() {
  const { tracks, loading, load } = useDaily();
  const [err, setErr] = useState<string | null>(null);
  if (!loading && !tracks.length) return null;
  return (
    <div className="rounded-card border border-border-default bg-background-surface/40 p-4 sm:p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="hud-label text-[#34D399] flex items-center gap-1.5"><CalendarClock size={12} /> Daily drops</span>
        <button onClick={load} className="text-text-muted hover:text-text-primary" title="Refresh"><RefreshCw size={13} /></button>
      </div>
      {err && <p className="text-[11px] text-accent-red mb-2">{err}</p>}
      {loading ? (
        <div className="py-6 flex justify-center"><Loader2 size={16} className="animate-spin text-text-muted" /></div>
      ) : (
        <div className="space-y-3">
          {tracks.map((t) => (
            <div key={t.id} className="rounded-input border border-border-default bg-background-base p-3 space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-sm text-text-primary flex-1 min-w-0 truncate">{t.title}</span>
                {t.bpm && <span className="text-[10px] font-mono text-text-muted">{t.bpm} BPM</span>}
                <span className="text-[10px] font-mono text-text-muted">{t.day}</span>
              </div>
              {t.theme && <p className="text-[11px] text-text-muted">{t.theme}</p>}
              {t.status === "pending" && <p className="text-[11px] text-text-secondary flex items-center gap-1.5"><Loader2 size={11} className="animate-spin text-[#34D399]" /> Composing — refresh in a few minutes.</p>}
              {t.status === "failed" && <p className="text-[11px] text-accent-red">Couldn't render: {t.error}</p>}
              {t.status === "done" && (
                <>
                  <audio controls preload="none" src={`${API}/${t.id}`} className="w-full h-9" />
                  <button onClick={() => { setErr(null); download(t).catch((e) => setErr(e.message)); }}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-input border border-border-default text-[11px] text-text-secondary hover:text-text-primary">
                    <Download size={11} /> Download
                  </button>
                </>
              )}
              {t.lyrics && (
                <details className="text-[11px] text-text-muted">
                  <summary className="cursor-pointer hover:text-text-secondary">Lyrics</summary>
                  <pre className="mt-1 whitespace-pre-wrap font-sans leading-relaxed text-text-secondary">{t.lyrics}</pre>
                </details>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
