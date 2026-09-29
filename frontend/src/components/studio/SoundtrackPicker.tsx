"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Music } from "lucide-react";
import type { Soundtrack } from "@/lib/episodeVideo";
import { fetchDailyAudio } from "@/components/studio/DailyDrop";

// The track an episode or reel is cut to: a file from this device, one of your
// Music Studio daily drops, or an ANCHOR release.

type Source = "none" | "file" | "daily" | "anchor";
interface Option { id: string; label: string; url?: string }

export function SoundtrackPicker({ onChange, accent }: { onChange: (s: Soundtrack | null) => void; accent: string }) {
  const [source, setSource] = useState<Source>("none");
  const [url, setUrl] = useState<string | null>(null);
  const [options, setOptions] = useState<Option[] | null>(null);
  const [pick, setPick] = useState("");
  const [start, setStart] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const blob = useRef<string | null>(null);

  const release = () => { if (blob.current) { URL.revokeObjectURL(blob.current); blob.current = null; } };
  useEffect(() => release, []);

  useEffect(() => {
    setOptions(null); setPick(""); setError(null);
    if (source !== "daily" && source !== "anchor") return;
    let live = true;
    (async () => {
      try {
        const res = await fetch(source === "daily" ? "/api/tools/music/daily" : "/api/tools/anchor");
        const d = await res.json();
        if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
        const list: Option[] = source === "daily"
          ? (d.tracks ?? []).filter((t: { status: string }) => t.status === "done").map((t: { id: string; day: string; title: string }) => ({ id: t.id, label: `${t.day} · ${t.title}` }))
          : (d.drops ?? []).filter((t: { audioUrl: string | null }) => t.audioUrl).map((t: { id: string; date: string; title: string; audioUrl: string }) => ({ id: t.id, label: `${t.date} · ${t.title}`, url: t.audioUrl }));
        if (live) setOptions(list);
      } catch (e) { if (live) setError(e instanceof Error ? e.message : "Couldn't load tracks"); }
    })();
    return () => { live = false; };
  }, [source]);

  useEffect(() => { onChange(url ? { url, start } : null); }, [url, start, onChange]);

  async function choose(id: string) {
    setPick(id); setError(null); release();
    setUrl(null);
    if (!id) return;
    const opt = options?.find((o) => o.id === id);
    if (source === "anchor" && opt?.url) return setUrl(opt.url);
    setLoading(true);
    try {
      blob.current = URL.createObjectURL(await fetchDailyAudio(id));
      setUrl(blob.current);
    } catch (e) { setError(e instanceof Error ? e.message : "Couldn't load that track"); }
    finally { setLoading(false); }
  }

  function upload(file: File | undefined) {
    release();
    setUrl(null);
    if (!file) return;
    blob.current = URL.createObjectURL(file);
    setUrl(blob.current);
  }

  const field = "bg-background-base border border-border-default rounded-input px-2 py-1 text-[11px] text-text-primary outline-none";
  return (
    <div className="flex flex-wrap items-center gap-2 text-[11px]">
      <Music size={12} style={{ color: accent }} />
      <span className="text-text-secondary">Soundtrack</span>
      <select value={source} onChange={(e) => { release(); setUrl(null); setSource(e.target.value as Source); }} className={field} aria-label="Soundtrack source">
        <option value="none">None</option>
        <option value="file">Upload a track</option>
        <option value="daily">My daily drops</option>
        <option value="anchor">ANCHOR releases</option>
      </select>
      {source === "file" && <input type="file" accept="audio/*" onChange={(e) => upload(e.target.files?.[0])} className="text-[11px] text-text-muted max-w-[220px]" aria-label="Soundtrack file" />}
      {(source === "daily" || source === "anchor") && (
        options
          ? <select value={pick} onChange={(e) => choose(e.target.value)} className={`${field} max-w-[240px]`} aria-label="Track">
              <option value="">{options.length ? "Pick a track" : "No tracks yet"}</option>
              {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          : !error && <Loader2 size={12} className="animate-spin text-text-muted" />
      )}
      {loading && <Loader2 size={12} className="animate-spin text-text-muted" />}
      {source !== "none" && (
        <label className="flex items-center gap-1 text-text-muted">
          from
          <input type="number" min={0} step={1} value={start} onChange={(e) => setStart(Math.max(0, Number(e.target.value) || 0))} className={`${field} w-16`} />
          s
        </label>
      )}
      {error && <span className="text-accent-red">{error}</span>}
    </div>
  );
}
