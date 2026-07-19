"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Loader2, Music, Play, Download, Sparkles, AlertTriangle, Copy, Check } from "lucide-react";

const GENRES = ["Lo-fi", "Pop", "Cinematic", "Acoustic", "EDM", "Hip-hop", "Ambient", "Rock", "Classical", "Indie", "R&B", "Jazz", "Hardtechno", "Folk"];
const MOODS = ["Uplifting", "Chill", "Energetic", "Melancholic", "Dreamy", "Epic", "Romantic", "Playful", "Dark", "Nostalgic"];
const VOCAL_STYLES = ["Smooth", "Powerful", "Soft/whispery", "Rap/spoken", "Choir", "Raspy"];
const LANGUAGES = ["English", "Hindi", "Punjabi", "Spanish", "French", "Korean", "Japanese", "Arabic"];
const STRUCTURES = ["Verse–Chorus", "Verse–Chorus–Bridge", "Intro–Build–Drop", "AABA", "Freeform"];

type Phase = "idle" | "generating" | "queued" | "ready" | "error";
const field = "w-full bg-background-base border border-border-default rounded-input px-3 py-2 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-[#34D399] transition-colors";
const lbl = "block text-xs font-mono text-text-secondary mb-1.5";

export function MusicStudio() {
  const [f, setF] = useState({
    title: "", description: "", genre: GENRES[0], subgenre: "", mood: MOODS[0],
    tempo: 120, duration: 30, vocals: true, vocalStyle: VOCAL_STYLES[0], vocalLanguage: LANGUAGES[0],
    lyricsMode: "auto" as "auto" | "manual" | "none", lyricsText: "",
    artistInspiration: "", instruments: "", energy: 6, structure: STRUCTURES[1],
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));

  const [phase, setPhase] = useState<Phase>("idle");
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [lyrics, setLyrics] = useState("");
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopPoll = useCallback(() => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } }, []);
  useEffect(() => () => stopPoll(), [stopPoll]);

  async function generate() {
    stopPoll();
    setPhase("generating"); setError(null); setNote(null); setAudioUrl(null); setStatus("Writing the track…");
    try {
      const res = await fetch("/api/tools/music", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(f),
      });
      const d = await res.json();
      if (!res.ok) { setPhase("error"); setError(d.error ?? `HTTP ${res.status}`); setPrompt(d.prompt ?? ""); setLyrics(d.lyrics ?? ""); return; }
      setPrompt(d.prompt ?? ""); setLyrics(d.lyrics ?? "");
      if (d.configured === false) { setPhase("error"); setNote(d.note); return; }
      if (d.fellBackToInstrumental) setNote("The vocal model wasn't available, so this is an instrumental version (lyrics shown below).");
      setPhase("queued"); setStatus("Composing audio… this can take up to a minute.");
      poll(d.jobId);
    } catch { setPhase("error"); setError("Network error — please try again."); }
  }

  function poll(jobId: string) {
    stopPoll();
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/tools/music?id=${encodeURIComponent(jobId)}`);
        const d = await res.json();
        if (d.status) setStatus(`Composing audio… (${d.status})`);
        if (d.status === "succeeded" && d.audioUrl) { stopPoll(); setAudioUrl(d.audioUrl); setPhase("ready"); setStatus(""); }
        else if (d.status === "failed" || d.status === "canceled" || d.error) { stopPoll(); setPhase("error"); setError(d.error || "Generation failed."); }
      } catch { /* keep polling */ }
    }, 3000);
  }

  const busy = phase === "generating" || phase === "queued";

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,380px)_1fr] gap-5">
      {/* Controls */}
      <div className="rounded-card border border-border-default bg-background-surface/40 p-4 sm:p-5 space-y-3.5 self-start">
        <div>
          <label className={lbl}>Describe the track <span className="text-accent-red">*</span></label>
          <textarea value={f.description} onChange={(e) => set("description", e.target.value)} rows={3}
            placeholder="e.g. a driving hardtechno track with pulsing bass for a late-night set" className={`${field} resize-y`} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className={lbl}>Song title</label><input value={f.title} onChange={(e) => set("title", e.target.value)} placeholder="optional" className={field} /></div>
          <div><label className={lbl}>Artist inspiration</label><input value={f.artistInspiration} onChange={(e) => set("artistInspiration", e.target.value)} placeholder="e.g. Charlotte de Witte" className={field} /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className={lbl}>Genre</label><select value={f.genre} onChange={(e) => set("genre", e.target.value)} className={field}>{GENRES.map((g) => <option key={g}>{g}</option>)}</select></div>
          <div><label className={lbl}>Sub-genre</label><input value={f.subgenre} onChange={(e) => set("subgenre", e.target.value)} placeholder="optional" className={field} /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className={lbl}>Mood</label><select value={f.mood} onChange={(e) => set("mood", e.target.value)} className={field}>{MOODS.map((m) => <option key={m}>{m}</option>)}</select></div>
          <div><label className={lbl}>Structure</label><select value={f.structure} onChange={(e) => set("structure", e.target.value)} className={field}>{STRUCTURES.map((s) => <option key={s}>{s}</option>)}</select></div>
        </div>
        <div><label className={lbl}>Instruments</label><input value={f.instruments} onChange={(e) => set("instruments", e.target.value)} placeholder="e.g. analog synth, 909 drums, sub bass" className={field} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className={lbl}>Tempo: {f.tempo} BPM</label><input type="range" min={60} max={180} value={f.tempo} onChange={(e) => set("tempo", Number(e.target.value))} className="w-full accent-[#34D399]" /></div>
          <div><label className={lbl}>Energy: {f.energy}/10</label><input type="range" min={1} max={10} value={f.energy} onChange={(e) => set("energy", Number(e.target.value))} className="w-full accent-[#34D399]" /></div>
        </div>
        <div><label className={lbl}>Length: {f.duration}s</label><input type="range" min={10} max={120} value={f.duration} onChange={(e) => set("duration", Number(e.target.value))} className="w-full accent-[#34D399]" /></div>

        <div className="flex items-center justify-between pt-1">
          <label className="text-xs font-mono text-text-secondary">Vocals + lyrics</label>
          <button onClick={() => set("vocals", !f.vocals)} className={`relative w-9 h-5 rounded-full transition-colors ${f.vocals ? "bg-[#34D399]" : "bg-border-default"}`}>
            <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${f.vocals ? "left-4" : "left-0.5"}`} />
          </button>
        </div>
        {f.vocals && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div><label className={lbl}>Vocal style</label><select value={f.vocalStyle} onChange={(e) => set("vocalStyle", e.target.value)} className={field}>{VOCAL_STYLES.map((v) => <option key={v}>{v}</option>)}</select></div>
              <div><label className={lbl}>Language</label><select value={f.vocalLanguage} onChange={(e) => set("vocalLanguage", e.target.value)} className={field}>{LANGUAGES.map((l) => <option key={l}>{l}</option>)}</select></div>
            </div>
            <div>
              <label className={lbl}>Lyrics</label>
              <div className="flex gap-1 mb-2">
                {(["auto", "manual", "none"] as const).map((m) => (
                  <button key={m} onClick={() => set("lyricsMode", m)}
                    className={`flex-1 text-[11px] py-1 rounded-input border ${f.lyricsMode === m ? "border-[#34D399] text-[#34D399] bg-[#34D399]/10" : "border-border-default text-text-muted"}`}>
                    {m === "auto" ? "Auto-write" : m === "manual" ? "My lyrics" : "No lyrics"}
                  </button>
                ))}
              </div>
              {f.lyricsMode === "manual" && (
                <textarea value={f.lyricsText} onChange={(e) => set("lyricsText", e.target.value)} rows={4} placeholder="[Verse]\n…\n[Chorus]\n…" className={`${field} resize-y`} />
              )}
            </div>
          </>
        )}

        <button onClick={generate} disabled={busy || !f.description.trim()}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-input text-sm font-semibold text-[#07070F] bg-[#34D399] hover:brightness-110 disabled:opacity-50 transition-all">
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
          {phase === "generating" ? "Writing…" : phase === "queued" ? "Composing…" : "Generate music"}
        </button>
        {note && <p className="text-xs text-[#F0C94E] flex items-start gap-1.5"><AlertTriangle size={12} className="flex-none mt-0.5" />{note}</p>}
        {error && <p className="text-xs text-accent-red">{error}</p>}
      </div>

      {/* Output */}
      <div className="rounded-card border border-border-default bg-background-surface/40 p-5 min-h-[420px]">
        {phase === "idle" && (
          <div className="h-full flex flex-col items-center justify-center text-center text-text-muted py-16">
            <Music size={28} className="opacity-40 mb-3 text-[#34D399]" />
            <p className="text-sm">Fill the brief and hit “Generate music”.</p>
            <p className="text-xs mt-1">You'll get a playable, downloadable audio track — instrumental or with AI vocals.</p>
          </div>
        )}
        {busy && (
          <div className="h-full flex flex-col items-center justify-center text-center text-text-secondary py-16">
            <Loader2 size={24} className="animate-spin text-[#34D399] mb-3" /><p className="text-sm">{status}</p>
          </div>
        )}
        {audioUrl && phase === "ready" && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-[#34D399]"><Play size={16} /><span className="hud-label text-[#34D399]">Your track</span></div>
            <audio controls src={audioUrl} className="w-full" />
            <a href={audioUrl} download className="inline-flex items-center gap-1.5 px-3 py-2 rounded-input border border-border-default text-xs text-text-secondary hover:text-text-primary"><Download size={12} /> Download</a>
          </div>
        )}
        {(prompt || lyrics) && (
          <div className={`${audioUrl ? "mt-6 pt-5 border-t border-border-default" : ""} space-y-4`}>
            {prompt && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="hud-label text-text-muted">Style prompt</span>
                  <button onClick={() => { navigator.clipboard.writeText(prompt); setCopied(true); setTimeout(() => setCopied(false), 1200); }} className="flex items-center gap-1 text-[11px] text-text-muted hover:text-text-primary">
                    {copied ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />} copy
                  </button>
                </div>
                <p className="text-sm text-text-secondary">{prompt}</p>
              </div>
            )}
            {lyrics && (
              <div>
                <span className="hud-label text-text-muted">Lyrics</span>
                <div className="prose-jarvis max-w-none text-sm text-text-secondary mt-1"><ReactMarkdown remarkPlugins={[remarkGfm]}>{lyrics}</ReactMarkdown></div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
